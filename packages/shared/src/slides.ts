import { z } from "zod";

export const SLIDE_TYPES = ["poll", "wordcloud", "scale", "qna", "quiz", "content"] as const;
export type SlideType = (typeof SLIDE_TYPES)[number];

export const SLIDE_TYPE_LABELS: Record<SlideType, string> = {
  poll: "Multiple choice",
  wordcloud: "Word cloud",
  scale: "Rating scale",
  qna: "Audience Q&A",
  quiz: "Quiz question",
  content: "Content",
};

export const THEMES = ["paper", "ink", "lagoon", "sunrise"] as const;
export type ThemeId = (typeof THEMES)[number];

export const QUIZ_TIME_LIMITS = [10, 20, 30, 45, 60] as const;
export const SCALE_MAXIMUMS = [5, 7, 10] as const;

export const LIMITS = {
  title: 120,
  question: 200,
  optionLabel: 80,
  pollOptionsMin: 2,
  pollOptionsMax: 6,
  quizOptionsMin: 2,
  quizOptionsMax: 4,
  scaleLabel: 40,
  heading: 120,
  body: 600,
  slides: 60,
  wordLength: 25,
  questionText: 280,
  participantName: 24,
} as const;

const optionId = z.string().regex(/^[a-z0-9]{4,12}$/);
const slideId = z.string().regex(/^[a-z0-9]{8,24}$/);
const question = z.string().trim().max(LIMITS.question);

export const optionSchema = z.object({
  id: optionId,
  label: z.string().trim().max(LIMITS.optionLabel),
});
export type Option = z.infer<typeof optionSchema>;

export const pollConfigSchema = z.object({
  question,
  options: z.array(optionSchema).min(LIMITS.pollOptionsMin).max(LIMITS.pollOptionsMax),
  multiple: z.boolean(),
});

export const wordcloudConfigSchema = z.object({
  question,
  maxEntries: z.number().int().min(1).max(3),
});

export const scaleConfigSchema = z.object({
  question,
  max: z.union([z.literal(5), z.literal(7), z.literal(10)]),
  minLabel: z.string().trim().max(LIMITS.scaleLabel),
  maxLabel: z.string().trim().max(LIMITS.scaleLabel),
});

export const qnaConfigSchema = z.object({
  question,
  moderate: z.boolean(),
  allowNames: z.boolean(),
});

export const quizConfigSchema = z.object({
  question,
  options: z.array(optionSchema).min(LIMITS.quizOptionsMin).max(LIMITS.quizOptionsMax),
  correctOptionId: optionId,
  timeLimit: z.union([
    z.literal(10),
    z.literal(20),
    z.literal(30),
    z.literal(45),
    z.literal(60),
  ]),
});

export const contentConfigSchema = z.object({
  heading: z.string().trim().max(LIMITS.heading),
  body: z.string().trim().max(LIMITS.body),
  image: z.string().regex(/^[a-z0-9-]{1,60}$/).nullable(),
  layout: z.enum(["centre", "split"]),
});

export const slideSchema = z.discriminatedUnion("type", [
  z.object({ id: slideId, type: z.literal("poll"), config: pollConfigSchema }),
  z.object({ id: slideId, type: z.literal("wordcloud"), config: wordcloudConfigSchema }),
  z.object({ id: slideId, type: z.literal("scale"), config: scaleConfigSchema }),
  z.object({ id: slideId, type: z.literal("qna"), config: qnaConfigSchema }),
  z.object({ id: slideId, type: z.literal("quiz"), config: quizConfigSchema }),
  z.object({ id: slideId, type: z.literal("content"), config: contentConfigSchema }),
]);
export type Slide = z.infer<typeof slideSchema>;
export type SlideOf<T extends SlideType> = Extract<Slide, { type: T }>;
export type PollConfig = z.infer<typeof pollConfigSchema>;
export type WordcloudConfig = z.infer<typeof wordcloudConfigSchema>;
export type ScaleConfig = z.infer<typeof scaleConfigSchema>;
export type QnaConfig = z.infer<typeof qnaConfigSchema>;
export type QuizConfig = z.infer<typeof quizConfigSchema>;
export type ContentConfig = z.infer<typeof contentConfigSchema>;

export const presentationDocSchema = z
  .object({
    title: z.string().trim().min(1).max(LIMITS.title),
    theme: z.enum(THEMES),
    slides: z.array(slideSchema).min(1).max(LIMITS.slides),
  })
  .superRefine((doc, ctx) => {
    const seen = new Set<string>();
    doc.slides.forEach((slide, index) => {
      if (seen.has(slide.id)) {
        ctx.addIssue({ code: "custom", path: ["slides", index, "id"], message: "Duplicate slide" });
      }
      seen.add(slide.id);
      if (slide.type === "quiz" && !slide.config.options.some((o) => o.id === slide.config.correctOptionId)) {
        ctx.addIssue({
          code: "custom",
          path: ["slides", index, "config", "correctOptionId"],
          message: "Choose the correct answer",
        });
      }
    });
  });
export type PresentationDoc = z.infer<typeof presentationDocSchema>;

/** Short random id for slides and options. Not secret, only unique within a presentation. */
export function newId(length = 10): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

export function blankSlide(type: SlideType): Slide {
  const id = newId(12);
  switch (type) {
    case "poll":
      return {
        id,
        type,
        config: {
          question: "",
          options: [
            { id: newId(6), label: "" },
            { id: newId(6), label: "" },
            { id: newId(6), label: "" },
          ],
          multiple: false,
        },
      };
    case "wordcloud":
      return { id, type, config: { question: "", maxEntries: 3 } };
    case "scale":
      return {
        id,
        type,
        config: { question: "", max: 5, minLabel: "Not at all", maxLabel: "Completely" },
      };
    case "qna":
      return {
        id,
        type,
        config: { question: "What would you like to ask?", moderate: false, allowNames: true },
      };
    case "quiz": {
      const options = [
        { id: newId(6), label: "" },
        { id: newId(6), label: "" },
        { id: newId(6), label: "" },
        { id: newId(6), label: "" },
      ];
      return {
        id,
        type,
        config: { question: "", options, correctOptionId: options[0]!.id, timeLimit: 20 },
      };
    }
    case "content":
      return { id, type, config: { heading: "", body: "", image: null, layout: "centre" } };
  }
}

/** The words a slide shows as its title, for lists and thumbnails. */
export function slideTitle(slide: Slide): string {
  if (slide.type === "content") return slide.config.heading;
  return slide.config.question;
}

/** Empty questions and options are allowed while editing, but not when presenting. */
export function slideProblems(slide: Slide): string[] {
  const problems: string[] = [];
  if (slide.type === "content") {
    if (!slide.config.heading && !slide.config.body && !slide.config.image) {
      problems.push("Add a heading, some text or an image");
    }
    return problems;
  }
  if (!slide.config.question) problems.push("Write the question");
  if (slide.type === "poll" || slide.type === "quiz") {
    if (slide.config.options.some((o) => !o.label)) problems.push("Fill in every answer");
  }
  return problems;
}

export function isInteractive(type: SlideType): boolean {
  return type !== "content";
}
