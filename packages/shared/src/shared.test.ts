import { describe, expect, it } from "vitest";

import { effectivePlan } from "./plans.ts";
import { formatJoinCode, parseJoinCode, publicSlide, quizPoints, initialSlideState } from "./session.ts";
import { blankSlide, presentationDocSchema, slideProblems } from "./slides.ts";
import { TEMPLATES, presentationFromTemplate } from "./templates.ts";
import { containsBlockedWord, normaliseWordEntry } from "./text.ts";

describe("join codes", () => {
  it("formats and reads back what people type", () => {
    expect(formatJoinCode("482913")).toBe("482 913");
    expect(parseJoinCode("482 913")).toBe("482913");
    expect(parseJoinCode("482-913")).toBe("482913");
    expect(parseJoinCode("https://roomwave.jeffgicharu.com/482913")).toBe("482913");
  });

  it("refuses codes that cannot exist", () => {
    expect(parseJoinCode("082913")).toBeNull();
    expect(parseJoinCode("48291")).toBeNull();
    expect(parseJoinCode("4829131")).toBeNull();
    expect(parseJoinCode("")).toBeNull();
  });
});

describe("quiz points", () => {
  it("gives the full thousand for an instant correct answer, half at the buzzer", () => {
    expect(quizPoints(true, 0, 20)).toBe(1000);
    expect(quizPoints(true, 10_000, 20)).toBe(750);
    expect(quizPoints(true, 20_000, 20)).toBe(500);
  });

  it("never goes outside 500 to 1,000 and gives nothing for a wrong answer", () => {
    expect(quizPoints(true, -50, 20)).toBe(1000);
    expect(quizPoints(true, 25_000, 20)).toBe(500);
    expect(quizPoints(false, 1_000, 20)).toBe(0);
  });
});

describe("word cloud entries", () => {
  it("groups the same word however it is typed", () => {
    const a = normaliseWordEntry("  Teamwork! ");
    const b = normaliseWordEntry("teamwork");
    expect(a).toEqual({ ok: true, display: "teamwork", key: "teamwork" });
    expect(b).toEqual(a);
  });

  it("allows short phrases and refuses long ones", () => {
    expect(normaliseWordEntry("work life balance")).toMatchObject({ ok: true });
    expect(normaliseWordEntry("far too many words here")).toEqual({
      ok: false,
      problem: "too_many_words",
    });
    expect(normaliseWordEntry("supercalifragilisticexpialidocious")).toEqual({
      ok: false,
      problem: "too_long",
    });
    expect(normaliseWordEntry("  ...  ")).toEqual({ ok: false, problem: "empty" });
  });
});

describe("the word filter", () => {
  it("catches blocked words and common disguises", () => {
    expect(containsBlockedWord("this is shit")).toBe(true);
    expect(containsBlockedWord("SH1T")).toBe(true);
    expect(containsBlockedWord("f*ck")).toBe(true);
    expect(containsBlockedWord("fuuuuck")).toBe(true);
    expect(containsBlockedWord("f u c k")).toBe(true);
    expect(containsBlockedWord("a$$")).toBe(true);
  });

  it("leaves ordinary words alone", () => {
    for (const fine of ["class", "assessment", "Scunthorpe", "cocktail", "passion", "shitake mushrooms"]) {
      expect(containsBlockedWord(fine), fine).toBe(false);
    }
  });
});

describe("slides", () => {
  it("hides a quiz answer until it is revealed", () => {
    const slide = blankSlide("quiz");
    const state = initialSlideState(slide);
    const hidden = publicSlide(slide, state);
    expect(hidden.type === "quiz" && hidden.config.correctOptionId).toBeNull();
    const revealed = publicSlide(slide, {
      ...state,
      quiz: { phase: "reveal", startedAt: 1, endsAt: 2 },
    });
    expect(revealed.type === "quiz" && revealed.config.correctOptionId).toBe(
      slide.type === "quiz" ? slide.config.correctOptionId : "",
    );
  });

  it("flags unfinished slides before presenting", () => {
    expect(slideProblems(blankSlide("poll"))).toContain("Write the question");
    expect(slideProblems(blankSlide("content"))).toHaveLength(1);
  });

  it("builds every template into a valid presentation with unique ids", () => {
    for (const template of TEMPLATES) {
      const doc = presentationFromTemplate(template);
      const parsed = presentationDocSchema.safeParse(doc);
      expect(parsed.success, `${template.id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("refuses a quiz whose correct answer is not one of its options", () => {
    const quiz = blankSlide("quiz");
    if (quiz.type !== "quiz") throw new Error("expected a quiz");
    quiz.config.correctOptionId = "nothere";
    const parsed = presentationDocSchema.safeParse({ title: "T", theme: "paper", slides: [quiz] });
    expect(parsed.success).toBe(false);
  });
});

describe("plans", () => {
  const now = new Date("2026-10-15T12:00:00Z");

  it("treats a running trial as Pro", () => {
    const status = effectivePlan("free", new Date("2026-10-20T00:00:00Z"), now);
    expect(status).toMatchObject({ plan: "pro", onTrial: true, trialUsed: true });
  });

  it("falls back to Free when the trial is over", () => {
    const status = effectivePlan("free", new Date("2026-10-01T00:00:00Z"), now);
    expect(status).toMatchObject({ plan: "free", onTrial: false, trialUsed: true });
  });
});
