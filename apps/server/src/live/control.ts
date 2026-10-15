import {
  QUIZ_GRACE_MS,
  effectivePlan,
  initialSlideState,
  PLANS,
  type Slide,
  type SlideState,
} from "@roomwave/shared";

import { db } from "../db/database.ts";
import type { UserRow } from "../db/schema.ts";
import { newToken } from "../security/tokens.ts";
import {
  pushCleared,
  pushEnded,
  pushView,
  scheduleResults,
  sendLeaderboard,
  sendQuizResults,
  onlineCount,
} from "./hub.ts";
import {
  currentSlide,
  forget,
  getSession,
  stateOf,
  updateSession,
  withSlideState,
  type LiveSession,
} from "./store.ts";

export type ControlResult = { ok: true } | { ok: false; error: string };

export async function goTo(sessionId: string, index: number): Promise<ControlResult> {
  const result = await updateSession(sessionId, (session) => {
    if (session.endedAt) return null;
    const target = Math.max(0, Math.min(index, session.slides.length - 1));
    if (target === session.slideIndex) return null;
    return { slideIndex: target };
  });
  if (!result) return { ok: false, error: "not_found" };
  if (result.changed) {
    pushView(result.session);
    scheduleResults(sessionId, currentSlide(result.session).id);
  }
  return { ok: true };
}

export async function setSlideFlags(
  sessionId: string,
  slideId: string,
  flags: { locked?: boolean | undefined; resultsHidden?: boolean | undefined },
): Promise<ControlResult> {
  const result = await updateSession(sessionId, (session) => {
    if (session.endedAt || !session.slides.some((s) => s.id === slideId)) return null;
    return {
      slideStates: withSlideState(session, slideId, (state) => ({
        ...state,
        ...(flags.locked !== undefined ? { locked: flags.locked } : {}),
        ...(flags.resultsHidden !== undefined ? { resultsHidden: flags.resultsHidden } : {}),
      })),
    };
  });
  if (!result) return { ok: false, error: "not_found" };
  if (result.changed) {
    pushView(result.session);
    scheduleResults(sessionId, slideId);
  }
  return { ok: true };
}

const revealTimers = new Map<string, NodeJS.Timeout>();

function scheduleReveal(sessionId: string, slideId: string, endsAt: number): void {
  const k = `${sessionId}/${slideId}`;
  clearTimeout(revealTimers.get(k));
  revealTimers.set(
    k,
    setTimeout(() => {
      revealTimers.delete(k);
      void quizAction(sessionId, slideId, "reveal").catch((error) => console.error("auto reveal failed", error));
    }, Math.max(0, endsAt - Date.now()) + QUIZ_GRACE_MS),
  );
}

export async function quizAction(
  sessionId: string,
  slideId: string,
  action: "start" | "reveal" | "leaderboard" | "reset",
): Promise<ControlResult> {
  if (action === "reset") return resetSlide(sessionId, slideId);

  const result = await updateSession(sessionId, (session) => {
    if (session.endedAt) return null;
    const slide = session.slides.find((s) => s.id === slideId);
    if (!slide || slide.type !== "quiz") return null;
    const state = stateOf(session, slide);
    const phase = state.quiz?.phase ?? "ready";
    const now = Date.now();
    let next: SlideState | null = null;
    if (action === "start" && phase === "ready") {
      next = {
        ...state,
        locked: false,
        resultsHidden: true,
        quiz: { phase: "open", startedAt: now, endsAt: now + slide.config.timeLimit * 1000 },
      };
    } else if (action === "reveal" && phase === "open") {
      next = { ...state, resultsHidden: false, quiz: { ...state.quiz!, phase: "reveal", endsAt: Math.min(state.quiz!.endsAt ?? now, now) } };
    } else if (action === "leaderboard" && (phase === "reveal" || phase === "leaderboard")) {
      next = { ...state, quiz: { ...state.quiz!, phase: "leaderboard" } };
    }
    if (!next) return null;
    return { slideStates: { ...session.slideStates, [slideId]: next } };
  });
  if (!result) return { ok: false, error: "not_found" };
  if (!result.changed) return { ok: true };

  const session = result.session;
  pushView(session);
  const phase = session.slideStates[slideId]?.quiz;
  if (action === "start" && phase?.endsAt) scheduleReveal(sessionId, slideId, phase.endsAt);
  if (action === "reveal") {
    clearTimeout(revealTimers.get(`${sessionId}/${slideId}`));
    scheduleResults(sessionId, slideId);
    await sendQuizResults(session, slideId);
  }
  if (action === "leaderboard") await sendLeaderboard(sessionId, slideId);
  return { ok: true };
}

/** Called after each quiz answer: once everyone in the room has answered, there is no need to wait. */
export async function revealIfEveryoneAnswered(sessionId: string, slideId: string, answered: number): Promise<void> {
  const online = await onlineCount(sessionId);
  if (online > 0 && answered >= online) await quizAction(sessionId, slideId, "reveal");
}

export async function resetSlide(sessionId: string, slideId: string): Promise<ControlResult> {
  const session = await getSession(sessionId);
  if (!session || session.endedAt) return { ok: false, error: "not_found" };
  const slide = session.slides.find((s) => s.id === slideId);
  if (!slide) return { ok: false, error: "not_found" };
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom("responses").where("session_id", "=", sessionId).where("slide_id", "=", slideId).execute();
    await trx.deleteFrom("questions").where("session_id", "=", sessionId).where("slide_id", "=", slideId).execute();
  });
  clearTimeout(revealTimers.get(`${sessionId}/${slideId}`));
  const result = await updateSession(sessionId, (s) => ({
    slideStates: { ...s.slideStates, [slideId]: initialSlideState(slide) },
  }));
  if (result) pushView(result.session);
  pushCleared(sessionId, slideId);
  scheduleResults(sessionId, slideId);
  return { ok: true };
}

export async function endLiveSession(sessionId: string): Promise<ControlResult> {
  const result = await updateSession(sessionId, (session) => (session.endedAt ? null : { endedAt: new Date() }));
  if (!result) return { ok: false, error: "not_found" };
  if (result.changed) pushEnded(sessionId);
  return { ok: true };
}

async function newJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = String(100000 + Math.floor(Math.random() * 900000));
    const taken = await db
      .selectFrom("live_sessions")
      .select("id")
      .where("code", "=", code)
      .where("ended_at", "is", null)
      .executeTakeFirst();
    if (!taken) return code;
  }
  throw new Error("Could not find a free join code");
}

/**
 * Starts a presentation, or picks up the session already running for it.
 * The session keeps its own copy of the slides; presenting again after an
 * edit refreshes that copy and keeps every answer already given.
 */
export async function startOrResume(
  owner: UserRow,
  presentation: { id: string; title: string; theme: LiveSession["theme"]; slides: Slide[] },
): Promise<LiveSession> {
  const limit = PLANS[effectivePlan(owner.plan, owner.trial_ends_at).plan].participants;
  const open = await db
    .selectFrom("live_sessions")
    .select("id")
    .where("presentation_id", "=", presentation.id)
    .where("ended_at", "is", null)
    .executeTakeFirst();

  if (open) {
    const result = await updateSession(open.id, (session) => {
      const states: Record<string, SlideState> = {};
      for (const slide of presentation.slides) {
        const before = session.slides.find((s) => s.id === slide.id);
        const kept = session.slideStates[slide.id];
        // A slide whose type changed starts again; anything else keeps its answers and state.
        if (before && before.type === slide.type && kept) states[slide.id] = kept;
      }
      return {
        slideIndex: Math.min(session.slideIndex, presentation.slides.length - 1),
        slideStates: states,
        snapshot: {
          title: presentation.title,
          theme: presentation.theme,
          slides: presentation.slides,
          participantLimit: limit,
        },
      };
    });
    if (!result) throw new Error("Session vanished");
    pushView(result.session);
    return result.session;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const row = await db
        .insertInto("live_sessions")
        .values({
          presentation_id: presentation.id,
          owner_id: owner.id,
          code: await newJoinCode(),
          title: presentation.title,
          theme: presentation.theme,
          slides: JSON.stringify(presentation.slides),
          slide_states: JSON.stringify({}),
          remote_token: newToken(24),
          participant_limit: limit,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      return getFresh(row.id);
    } catch (error) {
      // Two starts at once, or a code taken in the meantime: try again.
      if (attempt === 2) throw error;
    }
  }
  throw new Error("unreachable");
}

async function getFresh(sessionId: string): Promise<LiveSession> {
  forget(sessionId);
  const session = await getSession(sessionId);
  if (!session) throw new Error("Session vanished");
  return session;
}
