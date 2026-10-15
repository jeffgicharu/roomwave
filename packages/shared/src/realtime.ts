import { z } from "zod";

import type { LeaderboardEntry, LiveView, Question, Results } from "./session.ts";
import { LIMITS, type Slide } from "./slides.ts";

/** Socket.IO namespaces. One connection path, three audiences. */
export const NAMESPACES = {
  audience: "/live",
  host: "/host",
  home: "/home",
} as const;

export const SOCKET_PATH = "/socket.io/";

// ---------------------------------------------------------------------------
// Audience

export const answerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("poll"),
    optionIds: z.array(z.string().max(12)).min(1).max(6),
  }),
  z.object({ type: z.literal("quiz"), optionId: z.string().max(12) }),
  z.object({ type: z.literal("scale"), value: z.number().int().min(1).max(10) }),
  z.object({ type: z.literal("wordcloud"), text: z.string().max(200) }),
]);
export type Answer = z.infer<typeof answerSchema>;

export const joinSchema = z.object({
  code: z.string().regex(/^[0-9]{6}$/),
  token: z
    .string()
    .regex(/^[A-Za-z0-9_-]{20,64}$/)
    .nullable(),
});

export const respondSchema = z.object({
  slideId: z.string().max(24),
  answer: answerSchema,
});

export const askSchema = z.object({
  slideId: z.string().max(24),
  text: z.string().max(1000),
  name: z.string().max(100).nullable(),
});

export const upvoteSchema = z.object({
  questionId: z.string().uuid(),
  on: z.boolean(),
});

export const setNameSchema = z.object({
  name: z.string().max(100),
});

/** What this participant has already given on a slide. */
export type Mine =
  | { type: "poll"; optionIds: string[] }
  | { type: "quiz"; optionId: string | null; correct: boolean | null; points: number | null }
  | { type: "scale"; value: number | null }
  | { type: "wordcloud"; entries: string[] }
  | { type: "qna"; asked: Question[]; upvoted: string[] }
  | { type: "content" };

export type JoinError = "not_found" | "ended" | "full" | "busy";

export type JoinReply =
  | {
      ok: true;
      participantId: string;
      token: string;
      name: string | null;
      view: LiveView;
      results: Results | null;
      mine: Mine;
    }
  | { ok: false; error: JoinError };

export type RespondError =
  | "not_joined"
  | "not_current"
  | "locked"
  | "not_open"
  | "too_late"
  | "invalid"
  | "blocked_word"
  | "limit"
  | "busy";

export type RespondReply = { ok: true; mine: Mine } | { ok: false; error: RespondError };

export type AskReply = { ok: true; question: Question } | { ok: false; error: RespondError };

export type SimpleReply = { ok: true } | { ok: false; error: string };

export interface QuizPersonalResult {
  slideId: string;
  correct: boolean;
  answered: boolean;
  points: number;
  score: number;
  rank: number;
  of: number;
}

export interface AudienceServerEvents {
  /** The slide on screen changed, or its state did. What a phone has answered it keeps itself. */
  view: (view: LiveView) => void;
  /** The presenter cleared a slide's answers: phones forget theirs too. */
  cleared: (slideId: string) => void;
  results: (slideId: string, results: Results) => void;
  quizResult: (result: QuizPersonalResult) => void;
  leaderboard: (slideId: string, entries: LeaderboardEntry[]) => void;
  ended: () => void;
}

export interface AudienceClientEvents {
  join: (payload: z.input<typeof joinSchema>, ack: (reply: JoinReply) => void) => void;
  respond: (payload: z.input<typeof respondSchema>, ack: (reply: RespondReply) => void) => void;
  ask: (payload: z.input<typeof askSchema>, ack: (reply: AskReply) => void) => void;
  upvote: (payload: z.input<typeof upvoteSchema>, ack: (reply: SimpleReply) => void) => void;
  setName: (payload: z.input<typeof setNameSchema>, ack: (reply: SimpleReply) => void) => void;
}

export const nameSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.participantName);

// ---------------------------------------------------------------------------
// Presenter, editor preview and phone remote

export const attachSchema = z.union([
  z.object({ sessionId: z.string().uuid() }),
  z.object({ remoteToken: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) }),
]);

export const goSchema = z.object({ index: z.number().int().min(0).max(200) });

export const slideUpdateSchema = z.object({
  slideId: z.string().max(24),
  locked: z.boolean().optional(),
  resultsHidden: z.boolean().optional(),
});

export const quizActionSchema = z.object({
  slideId: z.string().max(24),
  action: z.enum(["start", "reveal", "leaderboard", "reset"]),
});

export const slideResetSchema = z.object({ slideId: z.string().max(24) });

export const moderateSchema = z.object({
  questionId: z.string().uuid(),
  status: z.enum(["live", "answered", "hidden"]),
});

export interface HostSnapshot {
  view: LiveView;
  presentationId: string;
  slides: Slide[];
  results: Record<string, Results>;
  participants: number;
  /** Only the owner sees the remote's address; the remote itself does not. */
  remoteToken: string | null;
  role: "presenter" | "remote";
}

export type AttachReply = { ok: true; snapshot: HostSnapshot } | { ok: false; error: string };

export interface HostServerEvents {
  view: (view: LiveView) => void;
  /** Someone tried to join a session that has reached its plan limit. */
  full: (limit: number) => void;
  results: (slideId: string, results: Results) => void;
  participants: (count: number) => void;
  leaderboard: (slideId: string, entries: LeaderboardEntry[]) => void;
  ended: () => void;
}

export interface HostClientEvents {
  attach: (payload: z.input<typeof attachSchema>, ack: (reply: AttachReply) => void) => void;
  go: (payload: z.input<typeof goSchema>, ack: (reply: SimpleReply) => void) => void;
  update: (payload: z.input<typeof slideUpdateSchema>, ack: (reply: SimpleReply) => void) => void;
  quiz: (payload: z.input<typeof quizActionSchema>, ack: (reply: SimpleReply) => void) => void;
  reset: (payload: z.input<typeof slideResetSchema>, ack: (reply: SimpleReply) => void) => void;
  moderate: (payload: z.input<typeof moderateSchema>, ack: (reply: SimpleReply) => void) => void;
  end: (payload: Record<string, never>, ack: (reply: SimpleReply) => void) => void;
}

// ---------------------------------------------------------------------------
// The live poll on the home page

export interface HomePoll {
  id: string;
  question: string;
  options: { id: string; label: string }[];
  counts: Record<string, number>;
  total: number;
}

export const homeVoteSchema = z.object({
  pollId: z.string().uuid(),
  optionId: z.string().max(12),
  token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/),
});

export type HomeVoteReply =
  | { ok: true; optionId: string }
  | { ok: false; error: "closed" | "invalid" | "busy" };

export interface HomeServerEvents {
  poll: (poll: HomePoll) => void;
}

export interface HomeClientEvents {
  hello: (
    payload: { token: string },
    ack: (reply: { poll: HomePoll | null; mine: string | null }) => void,
  ) => void;
  vote: (payload: z.input<typeof homeVoteSchema>, ack: (reply: HomeVoteReply) => void) => void;
}
