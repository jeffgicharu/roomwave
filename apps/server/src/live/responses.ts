import { sql, type Transaction } from "kysely";

import {
  QUIZ_GRACE_MS,
  containsBlockedWord,
  normaliseWordEntry,
  quizPoints,
  type Answer,
  type Mine,
  type RespondReply,
  type Slide,
} from "@roomwave/shared";

import { db } from "../db/database.ts";
import type { Database } from "../db/schema.ts";
import { currentSlide, stateOf, type LiveSession } from "./store.ts";
import { listQuestions } from "./results.ts";

// Written out, not bound, so PostgreSQL can match it to the partial unique index.
const ONE_ANSWER = sql<boolean>`kind <> 'wordcloud'`;

/**
 * Votes are saved without waiting for the disk to confirm the write. If the
 * server lost power, the last fraction of a second of votes could be lost;
 * in exchange every vote is acknowledged quickly even on a slow disk.
 */
async function fastWrite<T>(work: (trx: Transaction<Database>) => Promise<T>): Promise<T> {
  return db.transaction().execute(async (trx) => {
    await sql`set local synchronous_commit = off`.execute(trx);
    return work(trx);
  });
}

export async function recordAnswer(
  session: LiveSession,
  participantId: string,
  slideId: string,
  answer: Answer,
): Promise<RespondReply> {
  const slide = currentSlide(session);
  if (slide.id !== slideId) return { ok: false, error: "not_current" };
  if (slide.type !== answer.type) return { ok: false, error: "invalid" };
  const state = stateOf(session, slide);
  if (state.locked) return { ok: false, error: "locked" };

  switch (slide.type) {
    case "poll": {
      if (answer.type !== "poll") return { ok: false, error: "invalid" };
      const valid = new Set(slide.config.options.map((o) => o.id));
      const chosen = [...new Set(answer.optionIds)];
      if (!chosen.every((id) => valid.has(id))) return { ok: false, error: "invalid" };
      if (!slide.config.multiple && chosen.length !== 1) return { ok: false, error: "invalid" };
      await fastWrite((trx) =>
        trx
          .insertInto("responses")
          .values({
            session_id: session.id,
            slide_id: slide.id,
            participant_id: participantId,
            kind: "poll",
            option_ids: chosen,
          })
          .onConflict((oc) =>
            oc
              .columns(["session_id", "slide_id", "participant_id"])
              .where(ONE_ANSWER)
              .doUpdateSet({ option_ids: chosen, updated_at: sql`now()` }),
          )
          .execute(),
      );
      return { ok: true, mine: { type: "poll", optionIds: chosen } };
    }

    case "scale": {
      if (answer.type !== "scale") return { ok: false, error: "invalid" };
      if (answer.value < 1 || answer.value > slide.config.max) return { ok: false, error: "invalid" };
      await fastWrite((trx) =>
        trx
          .insertInto("responses")
          .values({
            session_id: session.id,
            slide_id: slide.id,
            participant_id: participantId,
            kind: "scale",
            value: answer.value,
          })
          .onConflict((oc) =>
            oc
              .columns(["session_id", "slide_id", "participant_id"])
              .where(ONE_ANSWER)
              .doUpdateSet({ value: answer.value, updated_at: sql`now()` }),
          )
          .execute(),
      );
      return { ok: true, mine: { type: "scale", value: answer.value } };
    }

    case "quiz": {
      if (answer.type !== "quiz") return { ok: false, error: "invalid" };
      const quiz = state.quiz;
      if (!quiz || quiz.phase !== "open" || quiz.startedAt === null || quiz.endsAt === null) {
        return { ok: false, error: "not_open" };
      }
      const now = Date.now();
      if (now > quiz.endsAt + QUIZ_GRACE_MS) return { ok: false, error: "too_late" };
      if (!slide.config.options.some((o) => o.id === answer.optionId)) return { ok: false, error: "invalid" };
      const elapsed = now - quiz.startedAt;
      const correct = answer.optionId === slide.config.correctOptionId;
      const points = quizPoints(correct, elapsed, slide.config.timeLimit);
      // The first answer stands; a second tap changes nothing.
      await fastWrite((trx) =>
        trx
          .insertInto("responses")
          .values({
            session_id: session.id,
            slide_id: slide.id,
            participant_id: participantId,
            kind: "quiz",
            option_id: answer.optionId,
            correct,
            points,
            elapsed_ms: Math.max(0, Math.round(elapsed)),
          })
          .onConflict((oc) => oc.columns(["session_id", "slide_id", "participant_id"]).where(ONE_ANSWER).doNothing())
          .execute(),
      );
      return { ok: true, mine: await mineFor(session.id, participantId, slide, false) };
    }

    case "wordcloud": {
      if (answer.type !== "wordcloud") return { ok: false, error: "invalid" };
      const entry = normaliseWordEntry(answer.text);
      if (!entry.ok) return { ok: false, error: "invalid" };
      if (containsBlockedWord(entry.display)) return { ok: false, error: "blocked_word" };
      const reply = await fastWrite(async (trx) => {
        const existing = await trx
          .selectFrom("responses")
          .select("word")
          .where("session_id", "=", session.id)
          .where("slide_id", "=", slide.id)
          .where("participant_id", "=", participantId)
          .execute();
        const words = existing.map((row) => row.word!).filter(Boolean);
        if (words.includes(entry.key)) return { ok: true as const, words };
        if (words.length >= slide.config.maxEntries) return { ok: false as const };
        await trx
          .insertInto("responses")
          .values({
            session_id: session.id,
            slide_id: slide.id,
            participant_id: participantId,
            kind: "wordcloud",
            word: entry.key,
          })
          .onConflict((oc) => oc.doNothing())
          .execute();
        return { ok: true as const, words: [...words, entry.key] };
      });
      if (!reply.ok) return { ok: false, error: "limit" };
      return { ok: true, mine: { type: "wordcloud", entries: reply.words } };
    }

  }
}

/** Everything this participant has given on a slide, for a phone that reconnects. */
export async function mineFor(
  sessionId: string,
  participantId: string,
  slide: Slide,
  revealed: boolean,
): Promise<Mine> {
  switch (slide.type) {
    case "content":
      return { type: "content" };
    case "qna": {
      const [asked, upvoted] = await Promise.all([
        db
          .selectFrom("questions")
          .select("id")
          .where("session_id", "=", sessionId)
          .where("slide_id", "=", slide.id)
          .where("participant_id", "=", participantId)
          .execute(),
        db
          .selectFrom("question_votes")
          .innerJoin("questions", "questions.id", "question_votes.question_id")
          .select("question_votes.question_id")
          .where("questions.session_id", "=", sessionId)
          .where("questions.slide_id", "=", slide.id)
          .where("question_votes.participant_id", "=", participantId)
          .execute(),
      ]);
      const mineIds = new Set(asked.map((row) => row.id));
      const questions = mineIds.size ? (await listQuestions(sessionId, slide.id)).filter((q) => mineIds.has(q.id)) : [];
      return { type: "qna", asked: questions, upvoted: upvoted.map((row) => row.question_id) };
    }
    default: {
      const rows = await db
        .selectFrom("responses")
        .select(["option_ids", "option_id", "value", "word", "correct", "points"])
        .where("session_id", "=", sessionId)
        .where("slide_id", "=", slide.id)
        .where("participant_id", "=", participantId)
        .orderBy("id")
        .execute();
      const row = rows[0];
      switch (slide.type) {
        case "poll":
          return { type: "poll", optionIds: row?.option_ids ?? [] };
        case "scale":
          return { type: "scale", value: row?.value ?? null };
        case "wordcloud":
          return { type: "wordcloud", entries: rows.map((r) => r.word!).filter(Boolean) };
        case "quiz":
          return {
            type: "quiz",
            optionId: row?.option_id ?? null,
            correct: revealed && row ? row.correct : null,
            points: revealed && row ? row.points : null,
          };
      }
    }
  }
}
