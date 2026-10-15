import { sql } from "kysely";

import type { LeaderboardEntry, Question, Results, Slide } from "@roomwave/shared";

import { db } from "../db/database.ts";

/** Counted from the database every time, so the numbers on screen are always the saved ones. */
export async function computeResults(sessionId: string, slide: Slide): Promise<Results> {
  switch (slide.type) {
    case "poll": {
      const rows = await db
        .selectFrom("responses")
        .select([sql<string>`unnest(option_ids)`.as("option"), (eb) => eb.fn.countAll<number>().as("count")])
        .where("session_id", "=", sessionId)
        .where("slide_id", "=", slide.id)
        .groupBy("option")
        .execute();
      const respondents = await countRespondents(sessionId, slide.id);
      return { type: "poll", respondents, counts: Object.fromEntries(rows.map((r) => [r.option, Number(r.count)])) };
    }
    case "quiz": {
      const rows = await db
        .selectFrom("responses")
        .select(["option_id", (eb) => eb.fn.countAll<number>().as("count")])
        .where("session_id", "=", sessionId)
        .where("slide_id", "=", slide.id)
        .groupBy("option_id")
        .execute();
      const counts: Record<string, number> = {};
      let respondents = 0;
      for (const row of rows) {
        if (row.option_id) counts[row.option_id] = Number(row.count);
        respondents += Number(row.count);
      }
      return { type: "quiz", respondents, counts };
    }
    case "scale": {
      const rows = await db
        .selectFrom("responses")
        .select(["value", (eb) => eb.fn.countAll<number>().as("count")])
        .where("session_id", "=", sessionId)
        .where("slide_id", "=", slide.id)
        .groupBy("value")
        .execute();
      const counts: Record<string, number> = {};
      let respondents = 0;
      let sum = 0;
      for (const row of rows) {
        if (row.value === null) continue;
        counts[String(row.value)] = Number(row.count);
        respondents += Number(row.count);
        sum += row.value * Number(row.count);
      }
      return {
        type: "scale",
        respondents,
        counts,
        average: respondents ? Math.round((sum / respondents) * 10) / 10 : null,
      };
    }
    case "wordcloud": {
      const [words, totals] = await Promise.all([
        db
          .selectFrom("responses")
          .select(["word", (eb) => eb.fn.countAll<number>().as("count")])
          .where("session_id", "=", sessionId)
          .where("slide_id", "=", slide.id)
          .groupBy("word")
          .orderBy("count", "desc")
          .orderBy("word")
          .limit(80)
          .execute(),
        db
          .selectFrom("responses")
          .select([
            (eb) => eb.fn.countAll<number>().as("entries"),
            sql<number>`count(distinct participant_id)`.as("respondents"),
          ])
          .where("session_id", "=", sessionId)
          .where("slide_id", "=", slide.id)
          .executeTakeFirstOrThrow(),
      ]);
      return {
        type: "wordcloud",
        respondents: Number(totals.respondents),
        entries: Number(totals.entries),
        words: words.filter((w) => w.word).map((w) => ({ text: w.word!, count: Number(w.count) })),
      };
    }
    case "qna":
      return { type: "qna", questions: await listQuestions(sessionId, slide.id) };
    case "content":
      return { type: "content" };
  }
}

async function countRespondents(sessionId: string, slideId: string): Promise<number> {
  const row = await db
    .selectFrom("responses")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("session_id", "=", sessionId)
    .where("slide_id", "=", slideId)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

export async function listQuestions(sessionId: string, slideId: string): Promise<Question[]> {
  const rows = await db
    .selectFrom("questions")
    .select(["id", "text", "name", "upvotes", "status", "created_at"])
    .where("session_id", "=", sessionId)
    .where("slide_id", "=", slideId)
    .orderBy("upvotes", "desc")
    .orderBy("created_at", "asc")
    .limit(300)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    name: row.name,
    upvotes: row.upvotes,
    status: row.status,
    createdAt: row.created_at.getTime(),
  }));
}

/** What the audience may see: no questions waiting for approval, none that were hidden. */
export function audienceResults(results: Results, resultsHidden: boolean, quizRevealed: boolean): Results | null {
  if (results.type === "qna") {
    return { type: "qna", questions: results.questions.filter((q) => q.status === "live" || q.status === "answered") };
  }
  if (results.type === "quiz") return quizRevealed ? results : null;
  if (resultsHidden) return null;
  return results;
}

export async function leaderboard(sessionId: string, limit: number | null = 10): Promise<LeaderboardEntry[]> {
  let query = db
    .selectFrom("responses")
    .innerJoin("participants", "participants.id", "responses.participant_id")
    .select([
      "participants.id as participantId",
      "participants.name as name",
      sql<number>`coalesce(sum(responses.points), 0)`.as("score"),
      sql<number>`rank() over (order by coalesce(sum(responses.points), 0) desc)`.as("rank"),
    ])
    .where("responses.session_id", "=", sessionId)
    .where("responses.kind", "=", "quiz")
    .groupBy(["participants.id", "participants.name"])
    .orderBy("score", "desc")
    .orderBy("participants.name");
  if (limit !== null) query = query.limit(limit);
  const rows = await query.execute();
  return rows.map((row) => ({
    participantId: row.participantId,
    name: row.name ?? "Anonymous",
    score: Number(row.score),
    rank: Number(row.rank),
  }));
}
