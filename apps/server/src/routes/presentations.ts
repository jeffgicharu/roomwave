import { sql } from "kysely";
import type { FastifyInstance } from "fastify";

import {
  PLANS,
  effectivePlan,
  newPresentationSchema,
  savePresentationSchema,
  slideProblems,
  slideTitle,
  type PresentationDetail,
  type PresentationSummary,
  type SessionSummary,
} from "@roomwave/shared";

import { requireUser } from "../auth/sessions.ts";
import { db } from "../db/database.ts";
import type { UserRow } from "../db/schema.ts";
import { HttpError, notFound, parse } from "../http/errors.ts";
import { startOrResume } from "../live/control.ts";
import { insertFromTemplate, insertPresentation } from "./presentations-store.ts";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function owned(id: string, user: UserRow) {
  if (!UUID.test(id)) throw notFound("That presentation");
  const row = await db
    .selectFrom("presentations")
    .selectAll()
    .where("id", "=", id)
    .where("owner_id", "=", user.id)
    .executeTakeFirst();
  if (!row) throw notFound("That presentation");
  return row;
}

async function openSession(presentationId: string) {
  const row = await db
    .selectFrom("live_sessions")
    .select(["id", "code"])
    .where("presentation_id", "=", presentationId)
    .where("ended_at", "is", null)
    .executeTakeFirst();
  return row ? { sessionId: row.id, code: row.code } : null;
}

async function checkPresentationAllowance(user: UserRow): Promise<void> {
  const plan = PLANS[effectivePlan(user.plan, user.trial_ends_at).plan];
  if (plan.presentations === null) return;
  const { count } = await db
    .selectFrom("presentations")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("owner_id", "=", user.id)
    .executeTakeFirstOrThrow();
  if (Number(count) >= plan.presentations) {
    throw new HttpError(
      403,
      "plan_limit",
      `The Free plan holds ${plan.presentations} presentations. Delete one, or start a Pro trial for unlimited presentations.`,
    );
  }
}

export async function presentationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/presentations", async (request) => {
    const user = await requireUser(request);
    const rows = await db
      .selectFrom("presentations")
      .leftJoin("live_sessions as open", (join) =>
        join.onRef("open.presentation_id", "=", "presentations.id").on("open.ended_at", "is", null),
      )
      .select([
        "presentations.id",
        "presentations.title",
        "presentations.theme",
        "presentations.slides",
        "presentations.updated_at",
        "open.id as open_id",
        "open.code as open_code",
        (eb) =>
          eb
            .selectFrom("live_sessions")
            .select((inner) => inner.fn.countAll<number>().as("n"))
            .whereRef("live_sessions.presentation_id", "=", "presentations.id")
            .as("session_count"),
      ])
      .where("presentations.owner_id", "=", user.id)
      .orderBy("presentations.updated_at", "desc")
      .execute();
    const presentations: PresentationSummary[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      theme: row.theme,
      slideCount: row.slides.length,
      firstQuestion: row.slides.map(slideTitle).find(Boolean) ?? "",
      updatedAt: row.updated_at.toISOString(),
      live: row.open_id && row.open_code ? { sessionId: row.open_id, code: row.open_code } : null,
      sessionCount: Number(row.session_count ?? 0),
    }));
    return { presentations };
  });

  app.post("/api/presentations", async (request, reply) => {
    const user = await requireUser(request);
    const input = parse(newPresentationSchema, request.body);
    await checkPresentationAllowance(user);
    const id = await insertFromTemplate(user.id, input.template);
    return reply.code(201).send({ id });
  });

  app.get<{ Params: { id: string } }>("/api/presentations/:id", async (request) => {
    const user = await requireUser(request);
    const row = await owned(request.params.id, user);
    const presentation: PresentationDetail = {
      id: row.id,
      title: row.title,
      theme: row.theme,
      slides: row.slides,
      version: row.version,
      updatedAt: row.updated_at.toISOString(),
      live: await openSession(row.id),
    };
    return { presentation };
  });

  // Saves the whole presentation. The version guards against two tabs
  // overwriting each other: a save based on an old version is refused.
  app.put<{ Params: { id: string } }>("/api/presentations/:id", async (request) => {
    const user = await requireUser(request);
    await owned(request.params.id, user);
    const input = parse(savePresentationSchema, request.body);
    const updated = await db
      .updateTable("presentations")
      .set({
        title: input.doc.title,
        theme: input.doc.theme,
        slides: JSON.stringify(input.doc.slides),
        version: sql`version + 1`,
        updated_at: sql`now()`,
      })
      .where("id", "=", request.params.id)
      .where("version", "=", input.version)
      .returning(["version", "updated_at"])
      .executeTakeFirst();
    if (!updated) {
      throw new HttpError(
        409,
        "conflict",
        "This presentation was changed in another tab or window. Reload to see the latest version.",
      );
    }
    return { version: updated.version, updatedAt: updated.updated_at.toISOString() };
  });

  app.post<{ Params: { id: string } }>("/api/presentations/:id/duplicate", async (request, reply) => {
    const user = await requireUser(request);
    const row = await owned(request.params.id, user);
    await checkPresentationAllowance(user);
    const id = await insertPresentation(user.id, {
      title: `${row.title} (copy)`.slice(0, 120),
      theme: row.theme,
      slides: row.slides,
    });
    return reply.code(201).send({ id });
  });

  app.delete<{ Params: { id: string } }>("/api/presentations/:id", async (request, reply) => {
    const user = await requireUser(request);
    await owned(request.params.id, user);
    if (await openSession(request.params.id)) {
      throw new HttpError(409, "live", "End the live session before deleting this presentation.");
    }
    await db.deleteFrom("presentations").where("id", "=", request.params.id).execute();
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>("/api/presentations/:id/present", async (request) => {
    const user = await requireUser(request);
    const row = await owned(request.params.id, user);
    const problems = row.slides
      .map((slide, index) => ({ index, problems: slideProblems(slide) }))
      .filter((entry) => entry.problems.length);
    if (problems.length) {
      throw new HttpError(
        422,
        "unfinished",
        problems.length === 1
          ? `Slide ${problems[0]!.index + 1} is not finished: ${problems[0]!.problems[0]!.toLowerCase()}.`
          : `${problems.length} slides are not finished yet. Look for the slides marked in the list.`,
      );
    }
    const session = await startOrResume(user, {
      id: row.id,
      title: row.title,
      theme: row.theme,
      slides: row.slides,
    });
    return { sessionId: session.id, code: session.code };
  });

  app.get<{ Params: { id: string } }>("/api/presentations/:id/sessions", async (request) => {
    const user = await requireUser(request);
    await owned(request.params.id, user);
    const rows = await db
      .selectFrom("live_sessions")
      .select([
        "live_sessions.id",
        "live_sessions.code",
        "live_sessions.started_at",
        "live_sessions.ended_at",
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
      .where("presentation_id", "=", request.params.id)
      .orderBy("started_at", "desc")
      .limit(50)
      .execute();
    const sessions: SessionSummary[] = rows.map((row) => ({
      id: row.id,
      code: row.code,
      startedAt: row.started_at.toISOString(),
      endedAt: row.ended_at?.toISOString() ?? null,
      participants: Number(row.participants ?? 0),
      responses: Number(row.responses ?? 0),
    }));
    return { sessions };
  });
}
