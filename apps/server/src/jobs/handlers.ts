import { sql } from "kysely";

import { db } from "../db/database.ts";
import { passwordResetEmail, sessionReportEmail } from "../email/templates.ts";
import { sendEmail } from "../email/send.ts";
import { config } from "../config.ts";
import { leaderboard } from "../live/results.ts";
import { renderReport } from "../reports/pdf.ts";
import { allResults, resultsFingerprint } from "../routes/sessions.ts";

export async function sendPasswordReset(userId: string, token: string): Promise<void> {
  const user = await db.selectFrom("users").select(["name", "email", "is_sample"]).where("id", "=", userId).executeTakeFirst();
  if (!user?.email || user.is_sample) return;
  const email = passwordResetEmail(user.name, token);
  await sendEmail({ kind: "password_reset", to: user.email, userId, ...email });
}

/** Draws the PDF for a session and keeps it, unless the saved one is still current. */
export async function renderSessionReport(sessionId: string): Promise<{ pdf: Buffer; title: string; startedAt: Date } | null> {
  const session = await db.selectFrom("live_sessions").selectAll().where("id", "=", sessionId).executeTakeFirst();
  if (!session) return null;
  const fingerprint = await resultsFingerprint(sessionId);
  const saved = await db
    .selectFrom("report_files")
    .select(["pdf", "responses_at"])
    .where("session_id", "=", sessionId)
    .executeTakeFirst();
  if (saved && Number(saved.responses_at) === fingerprint) {
    return { pdf: saved.pdf, title: session.title, startedAt: session.started_at };
  }

  const [results, board, counts] = await Promise.all([
    allResults(sessionId, session.slides),
    leaderboard(sessionId, 10),
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
      .where("id", "=", sessionId)
      .executeTakeFirstOrThrow(),
  ]);
  const pdf = await renderReport({
    title: session.title,
    code: session.code,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    participants: Number(counts.participants ?? 0),
    responses: Number(counts.responses ?? 0),
    slides: session.slides,
    results,
    leaderboard: board,
  });
  await db
    .insertInto("report_files")
    .values({ session_id: sessionId, pdf, responses_at: fingerprint })
    .onConflict((oc) => oc.column("session_id").doUpdateSet({ pdf, responses_at: fingerprint, created_at: sql`now()` }))
    .execute();
  return { pdf, title: session.title, startedAt: session.started_at };
}

export async function emailSessionReport(sessionId: string, userId: string): Promise<void> {
  const user = await db
    .selectFrom("users")
    .select(["name", "email", "is_guest", "is_sample"])
    .where("id", "=", userId)
    .executeTakeFirst();
  if (!user?.email || user.is_guest || user.is_sample) return;
  const report = await renderSessionReport(sessionId);
  if (!report) return;
  const counts = await db
    .selectFrom("live_sessions")
    .select([
      "presentation_id",
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
    .where("id", "=", sessionId)
    .executeTakeFirstOrThrow();
  const url = `${config.SITE_URL}/app/presentations/${counts.presentation_id}/sessions/${sessionId}`;
  const email = sessionReportEmail(
    user.name,
    report.title,
    report.startedAt,
    Number(counts.participants ?? 0),
    Number(counts.responses ?? 0),
    url,
  );
  const safeName = report.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 60) || "results";
  await sendEmail({
    kind: "session_report",
    to: user.email,
    userId,
    ...email,
    attachments: [{ filename: `${safeName}.pdf`, content: report.pdf }],
  });
}

/** Hourly: close sessions nobody has used for six hours, and clear expired guests and links. */
export async function cleanUp(): Promise<Record<string, number>> {
  const ended = await db
    .updateTable("live_sessions")
    .set({ ended_at: sql`now()` })
    .where("ended_at", "is", null)
    .where("last_activity_at", "<", sql<Date>`now() - interval '6 hours'`)
    .executeTakeFirst();
  const guests = await db
    .deleteFrom("users")
    .where("is_guest", "=", true)
    .where("guest_expires_at", "<", sql<Date>`now()`)
    .executeTakeFirst();
  const sessions = await db.deleteFrom("auth_sessions").where("expires_at", "<", sql<Date>`now()`).executeTakeFirst();
  const resets = await db
    .deleteFrom("password_resets")
    .where("expires_at", "<", sql<Date>`now() - interval '1 day'`)
    .executeTakeFirst();
  const reports = await db
    .deleteFrom("report_files")
    .where("created_at", "<", sql<Date>`now() - interval '14 days'`)
    .executeTakeFirst();
  return {
    endedSessions: Number(ended.numUpdatedRows),
    expiredGuests: Number(guests.numDeletedRows),
    expiredSignIns: Number(sessions.numDeletedRows),
    oldResetLinks: Number(resets.numDeletedRows),
    oldReports: Number(reports.numDeletedRows),
  };
}

/** Nightly: the home page asks the next question in the list. */
export async function rotateHomePoll(): Promise<string | null> {
  return db.transaction().execute(async (trx) => {
    const polls = await trx.selectFrom("home_polls").select(["id", "active", "position"]).orderBy("position").execute();
    if (!polls.length) return null;
    const index = polls.findIndex((p) => p.active);
    const next = polls[(index + 1) % polls.length]!;
    await trx.updateTable("home_polls").set({ active: false }).where("active", "=", true).execute();
    await trx.updateTable("home_polls").set({ active: true, activated_at: sql`now()` }).where("id", "=", next.id).execute();
    // The question starts fresh each time it comes round.
    await trx.deleteFrom("home_votes").where("poll_id", "=", next.id).execute();
    return next.id;
  });
}
