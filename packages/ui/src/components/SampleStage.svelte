<script lang="ts">
  import { onMount } from "svelte";

  import type { Question, Results, Slide, SlideState, ThemeId } from "@roomwave/shared";

  import { THEMES_BY_ID } from "../themes.ts";
  import SlideView from "./SlideView.svelte";

  type Scenario = "poll" | "wordcloud" | "scale" | "qna";

  interface Props {
    scenario?: Scenario;
    theme?: ThemeId;
    /** Milliseconds between arrivals. */
    pace?: number;
  }

  let { scenario = "poll", theme = "ink", pace = 650 }: Props = $props();

  const SLIDES: Record<Scenario, Slide> = {
    poll: {
      id: "samplepoll01",
      type: "poll",
      config: {
        question: "What should we fix first?",
        options: [
          { id: "o1", label: "Start on time" },
          { id: "o2", label: "Fewer slides" },
          { id: "o3", label: "More questions" },
          { id: "o4", label: "Better coffee" },
        ],
        multiple: false,
      },
    },
    wordcloud: {
      id: "samplecloud1",
      type: "wordcloud",
      config: { question: "One word for today's session", maxEntries: 3 },
    },
    scale: {
      id: "samplescale1",
      type: "scale",
      config: { question: "How useful was this workshop?", max: 5, minLabel: "Not useful", maxLabel: "Very useful" },
    },
    qna: {
      id: "sampleqna001",
      type: "qna",
      config: { question: "Questions for the panel", moderate: false, allowNames: true },
    },
  };

  const WEIGHTS = [5, 3, 4, 1.5];
  const WORDS = ["energy", "clarity", "teamwork", "inspiring", "practical", "long", "fun", "focus", "useful", "insightful", "hopeful", "busy"];
  const QUESTIONS = [
    "How will this work for teams outside Nairobi?",
    "Can we get the slides after the session?",
    "What does the first month look like?",
    "Is there support for small businesses?",
    "When do applications open?",
  ];

  const slide = $derived(SLIDES[scenario]);
  const slideState: SlideState = { locked: false, resultsHidden: false };

  let results = $state<Results | null>(null);
  let tick = 0;

  function pickWeighted<T>(items: T[], weights: number[]): T {
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }

  function reset() {
    tick = 0;
    if (scenario === "poll") results = { type: "poll", respondents: 0, counts: {} };
    if (scenario === "scale") results = { type: "scale", respondents: 0, counts: {}, average: null };
    if (scenario === "wordcloud") results = { type: "wordcloud", respondents: 0, entries: 0, words: [] };
    if (scenario === "qna") results = { type: "qna", questions: [] };
  }

  function step() {
    tick += 1;
    const r = results;
    if (!r) return;
    if (r.type === "poll") {
      if (r.respondents > 160) return reset();
      const burst = 1 + Math.floor(Math.random() * 4);
      const counts = { ...r.counts };
      for (let i = 0; i < burst; i++) {
        const id = pickWeighted(["o1", "o2", "o3", "o4"], WEIGHTS);
        counts[id] = (counts[id] ?? 0) + 1;
      }
      results = { type: "poll", respondents: r.respondents + burst, counts };
    } else if (r.type === "scale") {
      if (r.respondents > 120) return reset();
      const value = pickWeighted([1, 2, 3, 4, 5], [0.4, 1, 3, 6, 4.5]);
      const counts = { ...r.counts, [String(value)]: (r.counts[String(value)] ?? 0) + 1 };
      const respondents = r.respondents + 1;
      const sum = Object.entries(counts).reduce((s, [k, c]) => s + Number(k) * c, 0);
      results = { type: "scale", respondents, counts, average: Math.round((sum / respondents) * 10) / 10 };
    } else if (r.type === "wordcloud") {
      if (r.entries > 70) return reset();
      const word = pickWeighted(WORDS, WORDS.map((_, i) => 12 - i));
      const words = [...r.words];
      const existing = words.find((w) => w.text === word);
      if (existing) existing.count += 1;
      else words.push({ text: word, count: 1 });
      words.sort((a, b) => b.count - a.count);
      results = { type: "wordcloud", respondents: r.respondents + 1, entries: r.entries + 1, words };
    } else if (r.type === "qna") {
      const questions: Question[] = r.questions.map((q) => ({ ...q }));
      if (questions.length < QUESTIONS.length && (tick % 3 === 1 || !questions.length)) {
        questions.push({
          id: `q${questions.length}`,
          text: QUESTIONS[questions.length]!,
          name: questions.length % 2 ? "Achieng" : null,
          upvotes: 0,
          status: "live",
          createdAt: Date.now(),
        });
      } else if (questions.length) {
        const q = questions[Math.floor(Math.random() * questions.length)]!;
        q.upvotes += 1 + Math.floor(Math.random() * 3);
      }
      if (questions.reduce((s, q) => s + q.upvotes, 0) > 120) return reset();
      questions.sort((a, b) => b.upvotes - a.upvotes);
      results = { type: "qna", questions };
    }
  }

  onMount(() => {
    reset();
    // People who prefer less motion see a finished result instead.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (let i = 0; i < 40; i++) step();
      return;
    }
    const timer = setInterval(step, pace);
    return () => clearInterval(timer);
  });
</script>

<SlideView {slide} {results} state={slideState} theme={THEMES_BY_ID[theme]} />
