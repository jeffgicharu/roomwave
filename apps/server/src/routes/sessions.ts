import { createHash } from "node:crypto";

import type { FastifyInstance } from "fastify";

import {
  PLANS,
  SLIDE_TYPE_LABELS,
  effectivePlan,
  slideTitle,
  type Results,
  type SessionResults,
  type Slide,
} from "@roomwave/shared";

import { requireUser } from "../auth/sessions.ts";
import { config } from "../config.ts";
import { db } from "../db/database.ts";
import type { UserRow } from "../db/schema.ts";
import { emailHold } from "../email/send.ts";
import { HttpError, notFound, tooMany } from "../http/errors.ts";
import { enqueue } from "../jobs/queue.ts";
import { endLiveSession } from "../live/control.ts";
import { computeResults, leaderboard } from "../live/results.ts";
import { allow } from "../security/ratelimit.ts";
import { UUID } from "./presentations.ts";

async function sessionFor(id: string, user: UserRow) {
  if (!UUID.test(id)) throw notFound("That session");
  let query = db.selectFrom("live_sessions").selectAll().where("id", "=", id);
  if (user.role !== "staff") query = query.where("owner_id", "=", user.id);
  const row = await query.executeTakeFirst();
  if (!row) throw notFound("That session");
  return row;
}

/** Changes whenever the results or the release change, so a saved report is reused until then and always has the current layout. */
export async function resultsFingerprint(sessionId: string): Promise<number> {
  const row = await db.selectFrom("live_sessions").select(["slides", "ended_at"]).where("id", "=", sessionId).executeTakeFirstOrThrow();
  const results = await allResults(sessionId, row.slides);
  const digest = createHash("sha256")
    .update(JSON.stringify([config.RELEASE, row.ended_at?.getTime() ?? null, row.slides, results]))
    .digest("hex");
  return parseInt(digest.slice(0, 12), 16);
}

function csvCell(value: string | number): string {
  const text = String(value);
  // A leading = + - @ would run as a formula in a spreadsheet.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function percent(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "0%";
}

export function resultsCsv(slides: Slide[], results: Record<string, Results>): string {
  const rows: (string | number)[][] = [["Slide", "Type", "Question", "Answer", "Count", "Share"]];
  slides.forEach((slide, index) => {
    const number = index + 1;
    const title = slideTitle(slide);
    const type = SLIDE_TYPE_LABELS[slide.type];
    const result = results[slide.id];
    if (!result) return;
    switch (result.type) {
      case "poll":
      case "quiz": {
        if (slide.type !== "poll" && slide.type !== "quiz") return;
        for (const option of slide.config.options) {
          const count = result.counts[option.id] ?? 0;
          const correct = slide.type === "quiz" && slide.config.correctOptionId === option.id ? " (correct)" : "";
          rows.push([number, type, title, option.label + correct, count, percent(count, result.respondents)]);
        }
        break;
      }
      case "scale": {
        if (slide.type !== "scale") return;
        for (let value = 1; value <= slide.config.max; value++) {
          const count = result.counts[String(value)] ?? 0;
          rows.push([number, type, title, String(value), count, percent(count, result.respondents)]);
        }
        rows.push([number, type, title, "Average", result.average ?? "", ""]);
        break;
      }
      case "wordcloud":
        for (const word of result.words) {
          rows.push([number, type, title, word.text, word.count, percent(word.count, result.entries)]);
        }
        break;
      case "qna":
        for (const question of result.questions.filter((q) => q.status !== "hidden")) {
          const who = question.name ? ` (${question.name})` : "";
          rows.push([number, type, title, question.text + who, question.upvotes, question.status]);
        }
        break;
      case "content":
        break;
    }
  });
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function allResults(sessionId: string, slides: Slide[]): Promise<Record<string, Results>> {
  const results: Record<string, Results> = {};
  for (const slide of slides) results[slide.id] = await computeResults(sessionId, slide);
  return results;
}

function fileName(title: string, startedAt: Date, extension: string): string {
  const base = title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "results";
  // The date the room saw: Nairobi time, written year-month-day (the Canadian English format is exactly that).
  const day = startedAt.toLocaleDateString("en-CA", { timeZone: "Africa/Nairobi" });
  return `${base}-${day}.${extension}`;
}

export async function sessionRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { id: string } }>("/api/sessions/:id/results", async (request) => {
    const user = await requireUser(request);
    const row = await sessionFor(request.params.id, user);
    const plan = PLANS[effectivePlan(user.plan, user.trial_ends_at).plan];
    const [results, board, counts] = await Promise.all([
      allResults(row.id, row.slides),
      leaderboard(row.id, 10),
      db
        .selectFrom("live_sessions")
        .select([
          (eb) =>
            eb
              .selectFrom("participants")
              .select((inner) => inner.fn.countAll<number>().as("n"))
              .whereRef("participants.session_id", "=", "live_sessions.id")
              .as("participants"),
          (eb) =>
            eb
              .selectFrom("responses")
              .select((inner) => inner.fn.countAll<number>().as("n"))
              .whereRef("responses.session_id", "=", "live_sessions.id")
              .as("responses"),
        ])
        .where("id", "=", row.id)
        .executeTakeFirstOrThrow(),
    ]);
    const body: SessionResults = {
      session: {
        id: row.id,
        code: row.code,
        startedAt: row.started_at.toISOString(),
        endedAt: row.ended_at?.toISOString() ?? null,
        participants: Number(counts.participants ?? 0),
        responses: Number(counts.responses ?? 0),
        presentationId: row.presentation_id,
        title: row.title,
        theme: row.theme,
      },
      slides: row.slides,
      results,
      leaderboard: board,
      canPdf: plan.pdfReports,
      canEmail: plan.emailReports && Boolean(user.email) && !user.is_guest,
    };
    return body;
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/export.csv", async (request, reply) => {
    const user = await requireUser(request);
    const row = await sessionFor(request.params.id, user);
    const csv = resultsCsv(row.slides, await allResults(row.id, row.slides));
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="${fileName(row.title, row.started_at, "csv")}"`)
      .send("﻿" + csv);
  });

  // The PDF is drawn by the worker, so a slow report never holds up a live vote.
  app.post<{ Params: { id: string } }>("/api/sessions/:id/report", async (request) => {
    const user = await requireUser(request);
    const row = await sessionFor(request.params.id, user);
    if (!PLANS[effectivePlan(user.plan, user.trial_ends_at).plan].pdfReports && user.role !== "staff") {
      throw new HttpError(403, "plan_limit", "PDF reports come with Pro. Start a free trial to try them.");
    }
    const fingerprint = await resultsFingerprint(row.id);
    const saved = await db
      .selectFrom("report_files")
      .select("responses_at")
      .where("session_id", "=", row.id)
      .executeTakeFirst();
    if (saved && Number(saved.responses_at) === fingerprint) return { status: "ready" };
    await enqueue({ kind: "render_report", sessionId: row.id }, `report-${row.id}-${fingerprint}`);
    return { status: "pending" };
  });

  app.get<{ Params: { id: string } }>("/api/sessions/:id/report.pdf", async (request, reply) => {
    const user = await requireUser(request);
    const row = await sessionFor(request.params.id, user);
    const saved = await db.selectFrom("report_files").select("pdf").where("session_id", "=", row.id).executeTakeFirst();
    if (!saved) throw notFound("That report");
    return reply
      .header("content-type", "application/pdf")
      .header("content-disposition", `attachment; filename="${fileName(row.title, row.started_at, "pdf")}"`)
      .send(saved.pdf);
  });

  app.post<{ Params: { id: string } }>("/api/sessions/:id/email", async (request, reply) => {
    const user = await requireUser(request);
    const row = await sessionFor(request.params.id, user);
    if (!PLANS[effectivePlan(user.plan, user.trial_ends_at).plan].emailReports) {
      throw new HttpError(403, "plan_limit", "Emailed reports come with Pro. Start a free trial to try them.");
    }
    if (!user.email || user.is_guest) {
      throw new HttpError(409, "no_email", "Add an email address to your account first.");
    }
    // Say so now if it cannot go out, rather than promise an email that never comes.
    const hold = await emailHold(user.email);
    if (hold) throw new HttpError(409, "email_held", hold.message);
    if (!(await allow("email-report", user.id, 3, 86_400))) throw tooMany();
    await enqueue({ kind: "session_report", sessionId: row.id, userId: user.id });
    return reply.code(202).send({ ok: true, to: user.email });
  });

  app.post<{ Params: { id: string } }>("/api/sessions/:id/end", async (request) => {
    const user = await requireUser(request);
    const row = await sessionFor(request.params.id, user);
    await endLiveSession(row.id);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/sessions/:id", async (request, reply) => {
    const user = await requireUser(request);
    const row = await sessionFor(request.params.id, user);
    if (!row.ended_at) throw new HttpError(409, "live", "End the session before deleting its results.");
    await db.deleteFrom("live_sessions").where("id", "=", row.id).execute();
    return reply.code(204).send();
  });
}
