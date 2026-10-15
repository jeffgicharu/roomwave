import type { Namespace } from "socket.io";

import type {
  AudienceClientEvents,
  AudienceServerEvents,
  HostClientEvents,
  HostServerEvents,
  QuizPersonalResult,
} from "@roomwave/shared";

import { db } from "../db/database.ts";
import { key, redis } from "../redis.ts";
import { audienceResults, computeResults, leaderboard } from "./results.ts";
import { getSession, liveView, stateOf, type LiveSession } from "./store.ts";

export interface AudienceData {
  sessionId?: string;
  participantId?: string;
}

export interface HostData {
  sessionId?: string;
  userId?: string | null;
  role?: "presenter" | "remote";
}

export type AudienceNamespace = Namespace<AudienceClientEvents, AudienceServerEvents, Record<string, never>, AudienceData>;
export type HostNamespace = Namespace<HostClientEvents, HostServerEvents, Record<string, never>, HostData>;

let audienceNs: AudienceNamespace | null = null;
let hostNs: HostNamespace | null = null;

export function attachNamespaces(audience: AudienceNamespace, host: HostNamespace): void {
  audienceNs = audience;
  hostNs = host;
}

export const sessionRoom = (sessionId: string) => `s:${sessionId}`;
export const participantRoom = (participantId: string) => `p:${participantId}`;

/** Sends the slide on screen to every presenter screen and every phone in the session. */
export function pushView(session: LiveSession): void {
  const view = liveView(session);
  hostNs?.to(sessionRoom(session.id)).emit("view", view);
  audienceNs?.to(sessionRoom(session.id)).emit("view", view);
}

export function pushEnded(sessionId: string): void {
  hostNs?.to(sessionRoom(sessionId)).emit("ended");
  audienceNs?.to(sessionRoom(sessionId)).emit("ended");
}

/** Tells the presenter, at most once a minute, that phones are being turned away. */
const fullNoticeAt = new Map<string, number>();
export function pushFull(sessionId: string, limit: number): void {
  if (Date.now() - (fullNoticeAt.get(sessionId) ?? 0) < 60_000) return;
  fullNoticeAt.set(sessionId, Date.now());
  hostNs?.to(sessionRoom(sessionId)).emit("full", limit);
}

export function pushCleared(sessionId: string, slideId: string): void {
  audienceNs?.to(sessionRoom(sessionId)).emit("cleared", slideId);
}

// Results are counted at most every RESULTS_EVERY_MS for each slide, however
// many votes arrive in between. A burst of 300 taps becomes a handful of updates.
const RESULTS_EVERY_MS = 120;
const pending = new Map<string, { timer: NodeJS.Timeout | null; again: boolean; running: boolean }>();

export function scheduleResults(sessionId: string, slideId: string): void {
  const k = `${sessionId}/${slideId}`;
  const entry = pending.get(k);
  if (entry) {
    entry.again = true;
    return;
  }
  const fresh = { timer: null as NodeJS.Timeout | null, again: false, running: false };
  pending.set(k, fresh);
  fresh.timer = setTimeout(() => void flushResults(k, sessionId, slideId), RESULTS_EVERY_MS);
}

async function flushResults(k: string, sessionId: string, slideId: string): Promise<void> {
  const entry = pending.get(k);
  if (!entry) return;
  entry.running = true;
  entry.again = false;
  try {
    await sendResults(sessionId, slideId);
  } catch (error) {
    console.error("results broadcast failed", error);
  } finally {
    entry.running = false;
    if (entry.again) {
      entry.again = false;
      entry.timer = setTimeout(() => void flushResults(k, sessionId, slideId), RESULTS_EVERY_MS);
    } else {
      pending.delete(k);
    }
  }
}

export async function sendResults(sessionId: string, slideId: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  const slide = session.slides.find((s) => s.id === slideId);
  if (!slide) return;
  const results = await computeResults(sessionId, slide);
  hostNs?.to(sessionRoom(sessionId)).emit("results", slideId, results);
  const state = stateOf(session, slide);
  const revealed = state.quiz?.phase === "reveal" || state.quiz?.phase === "leaderboard";
  const forPhones = audienceResults(results, state.resultsHidden, revealed);
  if (forPhones) audienceNs?.to(sessionRoom(sessionId)).emit("results", slideId, forPhones);
}

/** After a quiz question is revealed, each phone learns how it did and where it stands. */
export async function sendQuizResults(session: LiveSession, slideId: string): Promise<void> {
  const [board, answers, participants] = await Promise.all([
    leaderboard(session.id, null),
    db
      .selectFrom("responses")
      .select(["participant_id", "correct", "points"])
      .where("session_id", "=", session.id)
      .where("slide_id", "=", slideId)
      .execute(),
    db.selectFrom("participants").select("id").where("session_id", "=", session.id).execute(),
  ]);
  const byParticipant = new Map(answers.map((a) => [a.participant_id, a]));
  const standing = new Map(board.map((entry) => [entry.participantId, entry]));
  const of = Math.max(board.length, 1);
  for (const { id } of participants) {
    const answer = byParticipant.get(id);
    const place = standing.get(id);
    const result: QuizPersonalResult = {
      slideId,
      answered: Boolean(answer),
      correct: Boolean(answer?.correct),
      points: answer?.points ?? 0,
      score: place?.score ?? 0,
      rank: place?.rank ?? of,
      of,
    };
    audienceNs?.to(participantRoom(id)).emit("quizResult", result);
  }
}

export async function sendLeaderboard(sessionId: string, slideId: string): Promise<void> {
  const board = await leaderboard(sessionId, 10);
  hostNs?.to(sessionRoom(sessionId)).emit("leaderboard", slideId, board);
  audienceNs?.to(sessionRoom(sessionId)).emit("leaderboard", slideId, board);
}

// ---------------------------------------------------------------------------
// Who is connected. Each process refreshes its own phones in a sorted set in
// Redis, scored by when they were last seen, so the count is right even while
// two releases share the audience during a deploy.

const SEEN_WITHIN_MS = 45_000;
const onlineKey = (sessionId: string) => key("online", sessionId);

export async function markOnline(sessionId: string, participantId: string): Promise<void> {
  await redis.multi().zadd(onlineKey(sessionId), Date.now(), participantId).expire(onlineKey(sessionId), 3600).exec();
  scheduleParticipants(sessionId);
}

export async function markOffline(sessionId: string, participantId: string): Promise<void> {
  await redis.zrem(onlineKey(sessionId), participantId);
  scheduleParticipants(sessionId);
}

export async function onlineCount(sessionId: string): Promise<number> {
  return redis.zcount(onlineKey(sessionId), Date.now() - SEEN_WITHIN_MS, "+inf");
}

const participantTimers = new Map<string, NodeJS.Timeout>();
function scheduleParticipants(sessionId: string): void {
  if (participantTimers.has(sessionId)) return;
  participantTimers.set(
    sessionId,
    setTimeout(async () => {
      participantTimers.delete(sessionId);
      try {
        hostNs?.to(sessionRoom(sessionId)).emit("participants", await onlineCount(sessionId));
      } catch (error) {
        console.error("participant count failed", error);
      }
    }, 1_000),
  );
}

/** Every 15 seconds: refresh this process's phones and drop the ones not seen for a while. */
export async function refreshPresence(): Promise<void> {
  if (!audienceNs) return;
  const now = Date.now();
  const bySession = new Map<string, Set<string>>();
  for (const socket of audienceNs.sockets.values()) {
    const { sessionId, participantId } = socket.data;
    if (!sessionId || !participantId) continue;
    let set = bySession.get(sessionId);
    if (!set) bySession.set(sessionId, (set = new Set()));
    set.add(participantId);
  }
  if (!bySession.size) return;
  const multi = redis.multi();
  for (const [sessionId, ids] of bySession) {
    const k = onlineKey(sessionId);
    for (const id of ids) multi.zadd(k, now, id);
    multi.zremrangebyscore(k, "-inf", now - SEEN_WITHIN_MS);
    multi.expire(k, 3600);
  }
  await multi.exec();
  for (const sessionId of bySession.keys()) scheduleParticipants(sessionId);
}

/** Number of live connections on this process, for the health screen. */
export function connectionCount(): number {
  return (audienceNs?.sockets.size ?? 0) + (hostNs?.sockets.size ?? 0);
}
