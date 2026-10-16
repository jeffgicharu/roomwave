import { sql } from "kysely";
import type { Socket } from "socket.io";

import {
  LIMITS,
  askSchema,
  cleanLine,
  containsBlockedWord,
  joinSchema,
  respondSchema,
  setNameSchema,
  upvoteSchema,
  type AudienceClientEvents,
  type AudienceServerEvents,
  type JoinReply,
} from "@roomwave/shared";

import { db } from "../db/database.ts";
import { hashToken, newToken } from "../security/tokens.ts";
import { revealIfEveryoneAnswered } from "./control.ts";
import {
  markOffline,
  markOnline,
  participantRoom,
  pushFull,
  scheduleResults,
  sessionRoom,
  type AudienceData,
  type AudienceNamespace,
} from "./hub.ts";
import { randomName } from "./names.ts";
import { askQuestion, setUpvote } from "./questions.ts";
import { mineFor, recordAnswer } from "./responses.ts";
import { audienceResults, computeResults } from "./results.ts";
import { currentSlide, findOpenSessionByCode, getSession, liveView, stateOf, touch } from "./store.ts";

type AudienceSocket = Socket<AudienceClientEvents, AudienceServerEvents, Record<string, never>, AudienceData>;

/**
 * Why phone connections ended, summed and logged once a minute. A room leaving
 * at the end shows as "client namespace disconnect"; a network that drops a
 * phone, or a phone that stops answering pings, as "transport close" or "ping timeout".
 */
const closedBecause = new Map<string, number>();
setInterval(() => {
  if (!closedBecause.size) return;
  console.log(`phone connections closed in the last minute: ${[...closedBecause].map(([why, n]) => `${n} ${why}`).join(", ")}`);
  closedBecause.clear();
}, 60_000).unref();

/**
 * Twenty messages in five seconds is more than any person taps. A whole hall
 * often shares one public address, so the limit is per connection, never per address.
 */
function rateLimiter(limit = 20, windowMs = 5_000): () => boolean {
  let windowStart = Date.now();
  let count = 0;
  return () => {
    const now = Date.now();
    if (now - windowStart > windowMs) {
      windowStart = now;
      count = 0;
    }
    count += 1;
    return count <= limit;
  };
}

/** Acknowledgements are optional for a misbehaving client; a missing one must not throw. */
function safe<T>(ack: unknown): (reply: T) => void {
  return typeof ack === "function" ? (ack as (reply: T) => void) : () => {};
}

export function registerAudience(ns: AudienceNamespace): void {
  ns.on("connection", (socket: AudienceSocket) => {
    const allowed = rateLimiter();

    socket.on("join", async (payload, rawAck) => {
      const ack = safe<JoinReply>(rawAck);
      if (!allowed()) return ack({ ok: false, error: "busy" });
      const input = joinSchema.safeParse(payload);
      if (!input.success) return ack({ ok: false, error: "not_found" });
      try {
        ack(await join(socket, input.data.code, input.data.token));
      } catch (error) {
        console.error("join failed", error);
        ack({ ok: false, error: "busy" });
      }
    });

    socket.on("respond", async (payload, rawAck) => {
      const ack = safe<Parameters<Parameters<AudienceClientEvents["respond"]>[1]>[0]>(rawAck);
      if (!allowed()) return ack({ ok: false, error: "busy" });
      const { sessionId, participantId } = socket.data;
      if (!sessionId || !participantId) return ack({ ok: false, error: "not_joined" });
      const input = respondSchema.safeParse(payload);
      if (!input.success) return ack({ ok: false, error: "invalid" });
      try {
        const session = await getSession(sessionId);
        if (!session || session.endedAt) return ack({ ok: false, error: "locked" });
        const reply = await recordAnswer(session, participantId, input.data.slideId, input.data.answer);
        ack(reply);
        if (reply.ok) {
          scheduleResults(sessionId, input.data.slideId);
          void touch(sessionId);
          if (input.data.answer.type === "quiz") {
            const { count } = await db
              .selectFrom("responses")
              .select((eb) => eb.fn.countAll<number>().as("count"))
              .where("session_id", "=", sessionId)
              .where("slide_id", "=", input.data.slideId)
              .executeTakeFirstOrThrow();
            await revealIfEveryoneAnswered(sessionId, input.data.slideId, Number(count));
          }
        }
      } catch (error) {
        console.error("respond failed", error);
        ack({ ok: false, error: "busy" });
      }
    });

    socket.on("ask", async (payload, rawAck) => {
      const ack = safe<Parameters<Parameters<AudienceClientEvents["ask"]>[1]>[0]>(rawAck);
      if (!allowed()) return ack({ ok: false, error: "busy" });
      const { sessionId, participantId } = socket.data;
      if (!sessionId || !participantId) return ack({ ok: false, error: "not_joined" });
      const input = askSchema.safeParse(payload);
      if (!input.success) return ack({ ok: false, error: "invalid" });
      try {
        const session = await getSession(sessionId);
        if (!session || session.endedAt) return ack({ ok: false, error: "locked" });
        const reply = await askQuestion(session, participantId, input.data.slideId, input.data.text, input.data.name);
        ack(reply);
        if (reply.ok) scheduleResults(sessionId, input.data.slideId);
      } catch (error) {
        console.error("ask failed", error);
        ack({ ok: false, error: "busy" });
      }
    });

    socket.on("upvote", async (payload, rawAck) => {
      const ack = safe<{ ok: true } | { ok: false; error: string }>(rawAck);
      if (!allowed()) return ack({ ok: false, error: "busy" });
      const { sessionId, participantId } = socket.data;
      if (!sessionId || !participantId) return ack({ ok: false, error: "not_joined" });
      const input = upvoteSchema.safeParse(payload);
      if (!input.success) return ack({ ok: false, error: "invalid" });
      try {
        const session = await getSession(sessionId);
        if (!session || session.endedAt) return ack({ ok: false, error: "locked" });
        const slideId = await setUpvote(session, participantId, input.data.questionId, input.data.on);
        if (!slideId) return ack({ ok: false, error: "invalid" });
        ack({ ok: true });
        scheduleResults(sessionId, slideId);
      } catch (error) {
        console.error("upvote failed", error);
        ack({ ok: false, error: "busy" });
      }
    });

    socket.on("setName", async (payload, rawAck) => {
      const ack = safe<{ ok: true } | { ok: false; error: string }>(rawAck);
      if (!allowed()) return ack({ ok: false, error: "busy" });
      const { participantId } = socket.data;
      if (!participantId) return ack({ ok: false, error: "not_joined" });
      const input = setNameSchema.safeParse(payload);
      const name = input.success ? cleanLine(input.data.name, LIMITS.participantName) : null;
      if (!name) return ack({ ok: false, error: "invalid" });
      if (containsBlockedWord(name)) return ack({ ok: false, error: "blocked_word" });
      await db.updateTable("participants").set({ name }).where("id", "=", participantId).execute();
      ack({ ok: true });
    });

    socket.on("disconnect", (reason) => {
      closedBecause.set(reason, (closedBecause.get(reason) ?? 0) + 1);
      const { sessionId, participantId } = socket.data;
      if (!sessionId || !participantId) return;
      // Another tab on this process may still hold the same participant.
      for (const other of ns.sockets.values()) {
        if (other.id !== socket.id && other.data.participantId === participantId) return;
      }
      void markOffline(sessionId, participantId).catch(() => {});
    });
  });
}

async function join(socket: AudienceSocket, code: string, token: string | null): Promise<JoinReply> {
  const session = await findOpenSessionByCode(code);
  if (!session) {
    const recent = await db
      .selectFrom("live_sessions")
      .select("id")
      .where("code", "=", code)
      .where("ended_at", ">", sql<Date>`now() - interval '12 hours'`)
      .executeTakeFirst();
    return { ok: false, error: recent ? "ended" : "not_found" };
  }

  let participant = token
    ? await db
        .selectFrom("participants")
        .select(["id", "name"])
        .where("session_id", "=", session.id)
        .where("token_hash", "=", hashToken(token))
        .executeTakeFirst()
    : undefined;

  let participantToken = token;
  if (!participant) {
    const { count } = await db
      .selectFrom("participants")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("session_id", "=", session.id)
      .executeTakeFirstOrThrow();
    if (Number(count) >= session.participantLimit) {
      pushFull(session.id, session.participantLimit);
      return { ok: false, error: "full" };
    }
    participantToken = newToken(24);
    participant = await db
      .insertInto("participants")
      .values({ session_id: session.id, token_hash: hashToken(participantToken), name: randomName() })
      .returning(["id", "name"])
      .executeTakeFirstOrThrow();
  }

  // A phone that moves to another session leaves the rooms of the first.
  const previous = socket.data.sessionId;
  if (previous && previous !== session.id) {
    await socket.leave(sessionRoom(previous));
    if (socket.data.participantId) await socket.leave(participantRoom(socket.data.participantId));
  }
  socket.data.sessionId = session.id;
  socket.data.participantId = participant.id;
  await socket.join([sessionRoom(session.id), participantRoom(participant.id)]);
  await markOnline(session.id, participant.id);
  void touch(session.id);

  const slide = currentSlide(session);
  const state = stateOf(session, slide);
  const revealed = state.quiz?.phase === "reveal" || state.quiz?.phase === "leaderboard";
  const [results, mine] = await Promise.all([
    computeResults(session.id, slide),
    mineFor(session.id, participant.id, slide, revealed),
  ]);
  return {
    ok: true,
    participantId: participant.id,
    token: participantToken!,
    name: participant.name,
    view: liveView(session),
    results: audienceResults(results, state.resultsHidden, revealed),
    mine,
  };
}
