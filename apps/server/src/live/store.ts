import { sql } from "kysely";

import {
  initialSlideState,
  publicSlide,
  type LiveView,
  type Slide,
  type SlideState,
  type ThemeId,
} from "@roomwave/shared";

import { db } from "../db/database.ts";
import type { LiveSessionRow } from "../db/schema.ts";

export interface LiveSession {
  id: string;
  presentationId: string;
  ownerId: string;
  code: string;
  title: string;
  theme: ThemeId;
  slides: Slide[];
  slideStates: Record<string, SlideState>;
  slideIndex: number;
  remoteToken: string;
  participantLimit: number;
  startedAt: Date;
  endedAt: Date | null;
}

function fromRow(row: LiveSessionRow): LiveSession {
  return {
    id: row.id,
    presentationId: row.presentation_id,
    ownerId: row.owner_id,
    code: row.code,
    title: row.title,
    theme: row.theme,
    slides: row.slides,
    slideStates: row.slide_states,
    slideIndex: row.slide_index,
    remoteToken: row.remote_token,
    participantLimit: row.participant_limit,
    startedAt: row.started_at,
    endedAt: row.ended_at,
  };
}

// Every vote needs to know which slide is showing. The answer is kept in
// memory for a moment, and dropped at once when any process changes it.
const CACHE_MS = 3_000;
const cache = new Map<string, { session: LiveSession; at: number }>();

let notifyOthers: (sessionId: string) => void = () => {};

/** Set by the live server: tells the other release, if one is running, to drop its copy. */
export function onSessionChanged(notify: (sessionId: string) => void): void {
  notifyOthers = notify;
}

export function forget(sessionId: string): void {
  cache.delete(sessionId);
}

export async function getSession(sessionId: string): Promise<LiveSession | null> {
  const hit = cache.get(sessionId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.session;
  const row = await db.selectFrom("live_sessions").selectAll().where("id", "=", sessionId).executeTakeFirst();
  if (!row) {
    cache.delete(sessionId);
    return null;
  }
  const session = fromRow(row);
  cache.set(sessionId, { session, at: Date.now() });
  return session;
}

export async function findOpenSessionByCode(code: string): Promise<LiveSession | null> {
  const row = await db
    .selectFrom("live_sessions")
    .selectAll()
    .where("code", "=", code)
    .where("ended_at", "is", null)
    .executeTakeFirst();
  if (!row) return null;
  const session = fromRow(row);
  cache.set(session.id, { session, at: Date.now() });
  return session;
}

export async function findOpenSessionByRemote(token: string): Promise<LiveSession | null> {
  const row = await db
    .selectFrom("live_sessions")
    .selectAll()
    .where("remote_token", "=", token)
    .where("ended_at", "is", null)
    .executeTakeFirst();
  return row ? fromRow(row) : null;
}

export function currentSlide(session: LiveSession): Slide {
  return session.slides[Math.min(session.slideIndex, session.slides.length - 1)]!;
}

export function stateOf(session: LiveSession, slide: Slide): SlideState {
  return session.slideStates[slide.id] ?? initialSlideState(slide);
}

export function liveView(session: LiveSession): LiveView {
  const slide = currentSlide(session);
  const state = stateOf(session, slide);
  return {
    sessionId: session.id,
    code: session.code,
    title: session.title,
    theme: session.theme,
    slideIndex: Math.min(session.slideIndex, session.slides.length - 1),
    slideCount: session.slides.length,
    slide: publicSlide(slide, state),
    state,
    ended: session.endedAt !== null,
    serverNow: Date.now(),
  };
}

export interface SessionChange {
  slideIndex?: number;
  slideStates?: Record<string, SlideState>;
  endedAt?: Date;
  snapshot?: { title: string; theme: ThemeId; slides: Slide[]; participantLimit: number };
}

/**
 * Changes a running session under a row lock, so two presenters (or a
 * presenter and the phone remote) pressing at once cannot undo each other.
 * The callback sees the current state and returns the change, or null to
 * leave it alone.
 */
export async function updateSession(
  sessionId: string,
  decide: (session: LiveSession) => SessionChange | null,
): Promise<{ session: LiveSession; changed: boolean } | null> {
  const result = await db.transaction().execute(async (trx) => {
    const row = await trx
      .selectFrom("live_sessions")
      .selectAll()
      .where("id", "=", sessionId)
      .forUpdate()
      .executeTakeFirst();
    if (!row) return null;
    const session = fromRow(row);
    const change = decide(session);
    if (!change) return { session, changed: false };
    const updated = await trx
      .updateTable("live_sessions")
      .set({
        ...(change.slideIndex !== undefined ? { slide_index: change.slideIndex } : {}),
        ...(change.slideStates !== undefined ? { slide_states: JSON.stringify(change.slideStates) } : {}),
        ...(change.endedAt !== undefined ? { ended_at: change.endedAt } : {}),
        ...(change.snapshot
          ? {
              title: change.snapshot.title,
              theme: change.snapshot.theme,
              slides: JSON.stringify(change.snapshot.slides),
              participant_limit: change.snapshot.participantLimit,
            }
          : {}),
        last_activity_at: sql`now()`,
      })
      .where("id", "=", sessionId)
      .returningAll()
      .executeTakeFirstOrThrow();
    return { session: fromRow(updated), changed: true };
  });
  if (result?.changed) {
    cache.set(sessionId, { session: result.session, at: Date.now() });
    notifyOthers(sessionId);
  }
  return result;
}

export function withSlideState(
  session: LiveSession,
  slideId: string,
  change: (state: SlideState) => SlideState,
): Record<string, SlideState> {
  const slide = session.slides.find((s) => s.id === slideId);
  if (!slide) return session.slideStates;
  return { ...session.slideStates, [slideId]: change(stateOf(session, slide)) };
}

/** Marks a session as in use, at most once a minute, so idle sessions can be closed. */
const touched = new Map<string, number>();
export async function touch(sessionId: string): Promise<void> {
  const last = touched.get(sessionId) ?? 0;
  if (Date.now() - last < 60_000) return;
  touched.set(sessionId, Date.now());
  await db.updateTable("live_sessions").set({ last_activity_at: sql`now()` }).where("id", "=", sessionId).execute();
}
