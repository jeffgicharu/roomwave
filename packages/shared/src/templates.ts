import { newId, type PresentationDoc, type Slide, type ThemeId } from "./slides.ts";

type Draft =
  | { type: "poll"; question: string; options: string[]; multiple?: boolean }
  | { type: "wordcloud"; question: string; maxEntries?: number }
  | { type: "scale"; question: string; max?: 5 | 7 | 10; minLabel: string; maxLabel: string }
  | { type: "qna"; question: string; moderate?: boolean; allowNames?: boolean }
  | {
      type: "quiz";
      question: string;
      options: string[];
      correct: number;
      timeLimit?: 10 | 20 | 30 | 45 | 60;
    }
  | { type: "content"; heading: string; body?: string; image?: string; layout?: "centre" | "split" };

function build(draft: Draft): Slide {
  const id = newId(12);
  switch (draft.type) {
    case "poll":
      return {
        id,
        type: "poll",
        config: {
          question: draft.question,
          options: draft.options.map((label) => ({ id: newId(6), label })),
          multiple: draft.multiple ?? false,
        },
      };
    case "wordcloud":
      return {
        id,
        type: "wordcloud",
        config: { question: draft.question, maxEntries: draft.maxEntries ?? 3 },
      };
    case "scale":
      return {
        id,
        type: "scale",
        config: {
          question: draft.question,
          max: draft.max ?? 5,
          minLabel: draft.minLabel,
          maxLabel: draft.maxLabel,
        },
      };
    case "qna":
      return {
        id,
        type: "qna",
        config: {
          question: draft.question,
          moderate: draft.moderate ?? false,
          allowNames: draft.allowNames ?? true,
        },
      };
    case "quiz": {
      const options = draft.options.map((label) => ({ id: newId(6), label }));
      return {
        id,
        type: "quiz",
        config: {
          question: draft.question,
          options,
          correctOptionId: options[draft.correct]!.id,
          timeLimit: draft.timeLimit ?? 20,
        },
      };
    }
    case "content":
      return {
        id,
        type: "content",
        config: {
          heading: draft.heading,
          body: draft.body ?? "",
          image: draft.image ?? null,
          layout: draft.layout ?? "centre",
        },
      };
  }
}

export interface Template {
  id: string;
  name: string;
  description: string;
  theme: ThemeId;
  slides: Draft[];
}

export const TEMPLATES: Template[] = [
  {
    id: "blank",
    name: "Blank presentation",
    description: "Start with one empty question.",
    theme: "paper",
    slides: [{ type: "poll", question: "", options: ["", "", ""] }],
  },
  {
    id: "welcome",
    name: "A tour of Roomwave",
    description: "One of every kind of slide, ready to present.",
    theme: "ink",
    slides: [
      {
        type: "content",
        heading: "Welcome to Roomwave",
        body: "Open the camera on your phone and scan the code, or go to the address at the top of the screen and enter the code. No app, no sign-up.",
        image: "hall-audience-wide",
        layout: "split",
      },
      {
        type: "poll",
        question: "How do you usually ask a question at a big event?",
        options: [
          "I raise my hand",
          "I wait for the break",
          "I whisper it to the person next to me",
          "I don't ask at all",
        ],
      },
      { type: "wordcloud", question: "Describe your last meeting in one word", maxEntries: 3 },
      {
        type: "scale",
        question: "How comfortable are you speaking up in a large room?",
        minLabel: "Not at all",
        maxLabel: "Completely",
      },
      {
        type: "quiz",
        question: "Which is the longest river in Africa?",
        options: ["The Nile", "The Congo", "The Niger", "The Zambezi"],
        correct: 0,
      },
      {
        type: "quiz",
        question: "Which is the largest lake in Africa by area?",
        options: ["Lake Tanganyika", "Lake Victoria", "Lake Malawi", "Lake Turkana"],
        correct: 1,
      },
      { type: "qna", question: "What would you like to ask?", moderate: false },
      {
        type: "content",
        heading: "Thank you",
        body: "Every answer is saved. The presenter can download the results after the session.",
      },
    ],
  },
  {
    id: "town-hall",
    name: "Company town hall",
    description: "Pulse check, priorities and questions for leadership.",
    theme: "lagoon",
    slides: [
      {
        type: "content",
        heading: "Quarterly town hall",
        body: "Join on your phone with the code at the top. Answers are anonymous unless you add your name.",
      },
      {
        type: "poll",
        question: "How did this quarter go for your team?",
        options: ["Better than we planned", "About as planned", "Harder than we planned"],
      },
      {
        type: "scale",
        question: "How clear are our priorities for next quarter?",
        minLabel: "Unclear",
        maxLabel: "Very clear",
      },
      { type: "wordcloud", question: "One word for how it feels to work here right now" },
      {
        type: "qna",
        question: "Your questions for the leadership team",
        moderate: true,
        allowNames: true,
      },
    ],
  },
  {
    id: "workshop",
    name: "Workshop kick-off",
    description: "Break the ice and learn who is in the room.",
    theme: "sunrise",
    slides: [
      {
        type: "wordcloud",
        question: "What do you hope to take away from today?",
        maxEntries: 2,
      },
      {
        type: "poll",
        question: "How much experience do you have with today's topic?",
        options: ["None yet", "A little", "I use it at work", "I could teach it"],
      },
      {
        type: "scale",
        question: "How much energy do you have right now?",
        max: 10,
        minLabel: "Running on empty",
        maxLabel: "Fully charged",
      },
      {
        type: "poll",
        question: "Which sessions interest you most?",
        options: ["Planning", "Facilitation", "Tools", "Measuring results"],
        multiple: true,
      },
      { type: "qna", question: "Anything you'd like us to cover?", moderate: false },
    ],
  },
  {
    id: "quiz-night",
    name: "Quiz night",
    description: "Five timed questions with a leaderboard.",
    theme: "ink",
    slides: [
      {
        type: "content",
        heading: "Quiz night",
        body: "Join with the code at the top and pick a name. The fastest correct answers score the most points.",
      },
      {
        type: "quiz",
        question: "What is the capital city of Rwanda?",
        options: ["Kampala", "Kigali", "Bujumbura", "Dodoma"],
        correct: 1,
      },
      {
        type: "quiz",
        question: "Mount Kilimanjaro is in which country?",
        options: ["Kenya", "Uganda", "Tanzania", "Ethiopia"],
        correct: 2,
      },
      {
        type: "quiz",
        question: "Which planet is known as the Red Planet?",
        options: ["Venus", "Mars", "Jupiter", "Mercury"],
        correct: 1,
        timeLimit: 10,
      },
      {
        type: "quiz",
        question: "How many players does each football team have on the pitch?",
        options: ["9", "10", "11", "12"],
        correct: 2,
        timeLimit: 10,
      },
      {
        type: "quiz",
        question: "Which is the largest ocean on Earth?",
        options: ["The Atlantic", "The Indian Ocean", "The Arctic", "The Pacific"],
        correct: 3,
      },
    ],
  },
  {
    id: "lecture-feedback",
    name: "Lecture feedback",
    description: "Check understanding before students leave.",
    theme: "paper",
    slides: [
      {
        type: "scale",
        question: "How well did you follow today's lecture?",
        minLabel: "I was lost",
        maxLabel: "Every step",
      },
      {
        type: "poll",
        question: "Which part should we go over again next week?",
        options: ["The definitions", "The worked example", "The proof", "Nothing, it was clear"],
      },
      { type: "wordcloud", question: "One idea you will remember from today", maxEntries: 1 },
      { type: "qna", question: "What is still unclear?", allowNames: false },
    ],
  },
  {
    id: "panel",
    name: "Panel discussion",
    description: "Moderated questions with upvotes for a panel.",
    theme: "lagoon",
    slides: [
      {
        type: "content",
        heading: "Ask the panel",
        body: "Send your question from your phone and upvote the ones you want answered first.",
      },
      {
        type: "poll",
        question: "Which topic should the panel start with?",
        options: ["Funding", "Hiring", "Regulation", "Growth outside Kenya"],
      },
      { type: "qna", question: "Questions for the panel", moderate: true, allowNames: true },
      {
        type: "scale",
        question: "How useful was this session?",
        max: 10,
        minLabel: "Not useful",
        maxLabel: "Very useful",
      },
    ],
  },
];

export function templateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function presentationFromTemplate(template: Template): PresentationDoc {
  return {
    title: template.id === "blank" ? "Untitled presentation" : template.name,
    theme: template.theme,
    slides: template.slides.map(build),
  };
}
