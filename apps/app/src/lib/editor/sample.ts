import type { Results, Slide, SlideState } from "@roomwave/shared";

const WORDS = ["clarity", "energy", "teamwork", "focus", "practical", "inspiring", "long", "useful", "fun", "busy"];
const SHAPE = [14, 9, 6, 4, 3, 2, 2, 1];

/** Believable results, so a presenter can see how a slide will look with a room behind it. */
export function sampleResults(slide: Slide): Results {
  switch (slide.type) {
    case "poll": {
      const counts = Object.fromEntries(slide.config.options.map((o, i) => [o.id, SHAPE[i] ?? 1]));
      return { type: "poll", respondents: Object.values(counts).reduce((a, b) => a + b, 0), counts };
    }
    case "quiz": {
      const counts = Object.fromEntries(
        slide.config.options.map((o, i) => [o.id, o.id === slide.config.correctOptionId ? 18 : (SHAPE[i + 1] ?? 2)]),
      );
      return { type: "quiz", respondents: Object.values(counts).reduce((a, b) => a + b, 0), counts };
    }
    case "scale": {
      const counts: Record<string, number> = {};
      let respondents = 0;
      let sum = 0;
      for (let v = 1; v <= slide.config.max; v++) {
        const c = Math.max(1, Math.round(10 * Math.exp(-((v - slide.config.max * 0.75) ** 2) / (slide.config.max * 0.6))));
        counts[String(v)] = c;
        respondents += c;
        sum += v * c;
      }
      return { type: "scale", respondents, counts, average: Math.round((sum / respondents) * 10) / 10 };
    }
    case "wordcloud":
      return {
        type: "wordcloud",
        respondents: 24,
        entries: 46,
        words: WORDS.map((text, i) => ({ text, count: Math.max(1, 12 - i * 1.3) | 0 })),
      };
    case "qna":
      return {
        type: "qna",
        questions: [
          { id: "s1", text: "Will the slides be shared after the session?", name: "Achieng", upvotes: 12, status: "live", createdAt: 0 },
          { id: "s2", text: "How does this affect teams outside Nairobi?", name: null, upvotes: 7, status: "live", createdAt: 0 },
          { id: "s3", text: "What is the timeline for the next phase?", name: "Brian", upvotes: 4, status: "live", createdAt: 0 },
        ],
      };
    case "content":
      return { type: "content" };
  }
}

export function previewState(slide: Slide, withResults: boolean): SlideState {
  if (slide.type === "quiz") {
    return {
      locked: false,
      resultsHidden: !withResults,
      quiz: { phase: withResults ? "reveal" : "ready", startedAt: null, endsAt: null },
    };
  }
  return { locked: false, resultsHidden: false };
}
