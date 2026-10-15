import type { QuizConfig, Slide, SlideType, ThemeId } from "./slides.ts";

export const JOIN_CODE_PATTERN = /^[1-9][0-9]{5}$/;

/** "482913" is shown and read aloud as "482 913". */
export function formatJoinCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** Accepts what people type: spaces, dashes, a pasted link. */
export function parseJoinCode(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return JOIN_CODE_PATTERN.test(digits) ? digits : null;
}

/**
 * Points for a quiz answer. A correct answer is worth 500 to 1,000 points:
 * the full thousand for an instant answer, falling to half at the buzzer.
 * Time is measured on the server, from when the question opened.
 */
export function quizPoints(correct: boolean, elapsedMs: number, limitSeconds: number): number {
  if (!correct) return 0;
  const limitMs = limitSeconds * 1000;
  const share = Math.min(Math.max(elapsedMs / limitMs, 0), 1);
  return Math.round(1000 - 500 * share);
}

/** Answers that arrive this long after the buzzer still count: the phone sent them in time. */
export const QUIZ_GRACE_MS = 600;

export type QuizPhase = "ready" | "open" | "reveal" | "leaderboard";

/** What the presenter has done with one slide during a session. */
export interface SlideState {
  locked: boolean;
  resultsHidden: boolean;
  quiz?: {
    phase: QuizPhase;
    startedAt: number | null;
    endsAt: number | null;
  };
}

export function initialSlideState(slide: Slide): SlideState {
  return {
    locked: false,
    resultsHidden: slide.type === "quiz",
    ...(slide.type === "quiz" ? { quiz: { phase: "ready", startedAt: null, endsAt: null } } : {}),
  };
}

/** A slide as the audience may see it: a quiz keeps its answer until it is revealed. */
export type PublicSlide =
  | Exclude<Slide, { type: "quiz" }>
  | {
      id: string;
      type: "quiz";
      config: Omit<QuizConfig, "correctOptionId"> & { correctOptionId: string | null };
    };

export function publicSlide(slide: Slide, state: SlideState): PublicSlide {
  if (slide.type !== "quiz") return slide;
  const revealed = state.quiz?.phase === "reveal" || state.quiz?.phase === "leaderboard";
  return {
    ...slide,
    config: { ...slide.config, correctOptionId: revealed ? slide.config.correctOptionId : null },
  };
}

export interface Question {
  id: string;
  text: string;
  name: string | null;
  upvotes: number;
  status: "pending" | "live" | "answered" | "hidden";
  createdAt: number;
}

export type Results =
  | { type: "poll"; respondents: number; counts: Record<string, number> }
  | { type: "quiz"; respondents: number; counts: Record<string, number> }
  | {
      type: "scale";
      respondents: number;
      counts: Record<string, number>;
      average: number | null;
    }
  | {
      type: "wordcloud";
      respondents: number;
      entries: number;
      words: { text: string; count: number }[];
    }
  | { type: "qna"; questions: Question[] }
  | { type: "content" };

export function emptyResults(type: SlideType): Results {
  switch (type) {
    case "poll":
    case "quiz":
      return { type, respondents: 0, counts: {} };
    case "scale":
      return { type, respondents: 0, counts: {}, average: null };
    case "wordcloud":
      return { type, respondents: 0, entries: 0, words: [] };
    case "qna":
      return { type, questions: [] };
    case "content":
      return { type };
  }
}

export interface LeaderboardEntry {
  participantId: string;
  name: string;
  score: number;
  rank: number;
}

/** The state of a live session as every screen sees it. */
export interface LiveView {
  sessionId: string;
  code: string;
  title: string;
  theme: ThemeId;
  slideIndex: number;
  slideCount: number;
  slide: PublicSlide;
  state: SlideState;
  ended: boolean;
  /** Server clock when this was sent, so phones can show the same countdown. */
  serverNow: number;
}
