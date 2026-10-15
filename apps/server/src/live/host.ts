import type { Socket } from "socket.io";

import {
  attachSchema,
  goSchema,
  moderateSchema,
  quizActionSchema,
  slideResetSchema,
  slideUpdateSchema,
  type AttachReply,
  type HostClientEvents,
  type HostServerEvents,
  type Results,
  type SimpleReply,
} from "@roomwave/shared";

import { SESSION_COOKIE, userFromToken } from "../auth/sessions.ts";
import { endLiveSession, goTo, quizAction, resetSlide, setSlideFlags } from "./control.ts";
import { onlineCount, scheduleResults, sessionRoom, type HostData, type HostNamespace } from "./hub.ts";
import { moderateQuestion } from "./questions.ts";
import { computeResults } from "./results.ts";
import { findOpenSessionByRemote, getSession, liveView } from "./store.ts";

type HostSocket = Socket<HostClientEvents, HostServerEvents, Record<string, never>, HostData>;

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function safe<T>(ack: unknown): (reply: T) => void {
  return typeof ack === "function" ? (ack as (reply: T) => void) : () => {};
}

export function registerHost(ns: HostNamespace): void {
  ns.on("connection", (socket: HostSocket) => {
    socket.on("attach", async (payload, rawAck) => {
      const ack = safe<AttachReply>(rawAck);
      const input = attachSchema.safeParse(payload);
      if (!input.success) return ack({ ok: false, error: "invalid" });
      try {
        ack(await attach(socket, input.data));
      } catch (error) {
        console.error("attach failed", error);
        ack({ ok: false, error: "busy" });
      }
    });

    /** Runs a command for the session this screen is attached to. */
    const command = <T>(
      name: keyof HostClientEvents,
      schema: { safeParse: (input: unknown) => { success: true; data: T } | { success: false } },
      run: (sessionId: string, input: T) => Promise<SimpleReply>,
    ) => {
      socket.on(name, async (payload: unknown, rawAck: unknown) => {
        const ack = safe<SimpleReply>(rawAck);
        const sessionId = socket.data.sessionId;
        if (!sessionId) return ack({ ok: false, error: "not_attached" });
        const input = schema.safeParse(payload ?? {});
        if (!input.success) return ack({ ok: false, error: "invalid" });
        try {
          ack(await run(sessionId, input.data));
        } catch (error) {
          console.error(`${name} failed`, error);
          ack({ ok: false, error: "busy" });
        }
      });
    };

    command("go", goSchema, (sessionId, input) => goTo(sessionId, input.index));
    command("update", slideUpdateSchema, (sessionId, input) =>
      setSlideFlags(sessionId, input.slideId, { locked: input.locked, resultsHidden: input.resultsHidden }),
    );
    command("quiz", quizActionSchema, (sessionId, input) => quizAction(sessionId, input.slideId, input.action));
    command("reset", slideResetSchema, (sessionId, input) => resetSlide(sessionId, input.slideId));
    command("moderate", moderateSchema, async (sessionId, input) => {
      const slideId = await moderateQuestion(sessionId, input.questionId, input.status);
      if (!slideId) return { ok: false, error: "not_found" };
      scheduleResults(sessionId, slideId);
      return { ok: true };
    });
    command("end", { safeParse: () => ({ success: true as const, data: {} }) }, async (sessionId) => {
      // The phone remote can move slides but cannot end the session.
      if (socket.data.role !== "presenter") return { ok: false, error: "forbidden" };
      return endLiveSession(sessionId);
    });
  });
}

async function attach(
  socket: HostSocket,
  input: { sessionId: string } | { remoteToken: string },
): Promise<AttachReply> {
  let role: "presenter" | "remote";
  let session;
  if ("remoteToken" in input) {
    session = await findOpenSessionByRemote(input.remoteToken);
    if (!session) return { ok: false, error: "not_found" };
    role = "remote";
  } else {
    const user = await userFromToken(cookieValue(socket.request.headers.cookie, SESSION_COOKIE));
    if (!user || user.suspended_at) return { ok: false, error: "signed_out" };
    session = await getSession(input.sessionId);
    if (!session) return { ok: false, error: "not_found" };
    if (session.ownerId !== user.id && user.role !== "staff") return { ok: false, error: "forbidden" };
    role = "presenter";
    socket.data.userId = user.id;
  }

  const previous = socket.data.sessionId;
  if (previous && previous !== session.id) await socket.leave(sessionRoom(previous));
  socket.data.sessionId = session.id;
  socket.data.role = role;
  await socket.join(sessionRoom(session.id));

  const results: Record<string, Results> = {};
  await Promise.all(
    session.slides.map(async (slide) => {
      results[slide.id] = await computeResults(session.id, slide);
    }),
  );
  return {
    ok: true,
    snapshot: {
      view: liveView(session),
      slides: session.slides,
      results,
      participants: await onlineCount(session.id),
      remoteToken: role === "presenter" ? session.remoteToken : null,
      role,
    },
  };
}
