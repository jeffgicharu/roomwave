import { sql } from "kysely";

import { LIMITS, cleanLine, containsBlockedWord, type AskReply, type Question } from "@roomwave/shared";

import { db } from "../db/database.ts";
import { currentSlide, stateOf, type LiveSession } from "./store.ts";

const MAX_QUESTIONS_EACH = 10;

export async function askQuestion(
  session: LiveSession,
  participantId: string,
  slideId: string,
  text: string,
  name: string | null,
): Promise<AskReply> {
  const slide = currentSlide(session);
  if (slide.id !== slideId) return { ok: false, error: "not_current" };
  if (slide.type !== "qna") return { ok: false, error: "invalid" };
  if (stateOf(session, slide).locked) return { ok: false, error: "locked" };

  const cleaned = cleanLine(text, LIMITS.questionText);
  if (!cleaned || cleaned.length < 2) return { ok: false, error: "invalid" };
  const cleanedName = slide.config.allowNames && name ? cleanLine(name, LIMITS.participantName) : null;
  if (containsBlockedWord(cleaned) || (cleanedName && containsBlockedWord(cleanedName))) {
    return { ok: false, error: "blocked_word" };
  }

  const { count } = await db
    .selectFrom("questions")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("session_id", "=", session.id)
    .where("slide_id", "=", slide.id)
    .where("participant_id", "=", participantId)
    .executeTakeFirstOrThrow();
  if (Number(count) >= MAX_QUESTIONS_EACH) return { ok: false, error: "limit" };

  const row = await db
    .insertInto("questions")
    .values({
      session_id: session.id,
      slide_id: slide.id,
      participant_id: participantId,
      text: cleaned,
      name: cleanedName,
      status: slide.config.moderate ? "pending" : "live",
    })
    .returning(["id", "text", "name", "upvotes", "status", "created_at"])
    .executeTakeFirstOrThrow();
  const question: Question = {
    id: row.id,
    text: row.text,
    name: row.name,
    upvotes: row.upvotes,
    status: row.status,
    createdAt: row.created_at.getTime(),
  };
  return { ok: true, question };
}

/** Adds or removes this participant's upvote. Returns the slide it belongs to, or null if not allowed. */
export async function setUpvote(
  session: LiveSession,
  participantId: string,
  questionId: string,
  on: boolean,
): Promise<string | null> {
  const question = await db
    .selectFrom("questions")
    .select(["id", "slide_id", "participant_id", "status"])
    .where("id", "=", questionId)
    .where("session_id", "=", session.id)
    .executeTakeFirst();
  if (!question || question.participant_id === participantId) return null;
  if (question.status !== "live") return null;

  await db.transaction().execute(async (trx) => {
    if (on) {
      const inserted = await trx
        .insertInto("question_votes")
        .values({ question_id: questionId, participant_id: participantId })
        .onConflict((oc) => oc.doNothing())
        .executeTakeFirst();
      if (Number(inserted.numInsertedOrUpdatedRows ?? 0) > 0) {
        await trx.updateTable("questions").set({ upvotes: sql`upvotes + 1` }).where("id", "=", questionId).execute();
      }
    } else {
      const deleted = await trx
        .deleteFrom("question_votes")
        .where("question_id", "=", questionId)
        .where("participant_id", "=", participantId)
        .executeTakeFirst();
      if (Number(deleted.numDeletedRows) > 0) {
        await trx
          .updateTable("questions")
          .set({ upvotes: sql`greatest(upvotes - 1, 0)` })
          .where("id", "=", questionId)
          .execute();
      }
    }
  });
  return question.slide_id;
}

export async function moderateQuestion(
  sessionId: string,
  questionId: string,
  status: "live" | "answered" | "hidden",
): Promise<string | null> {
  const row = await db
    .updateTable("questions")
    .set({ status, answered_at: status === "answered" ? new Date() : null })
    .where("id", "=", questionId)
    .where("session_id", "=", sessionId)
    .returning("slide_id")
    .executeTakeFirst();
  return row?.slide_id ?? null;
}
