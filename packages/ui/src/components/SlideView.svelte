<script lang="ts">
  import {
    SLIDE_TYPE_LABELS,
    emptyResults,
    type LeaderboardEntry,
    type PublicSlide,
    type Results,
    type Slide,
    type SlideState,
  } from "@roomwave/shared";

  import { themeStyle, type Theme } from "../themes.ts";
  import BarChart from "./BarChart.svelte";
  import Leaderboard from "./Leaderboard.svelte";
  import Mark from "./Mark.svelte";
  import QuestionWall from "./QuestionWall.svelte";
  import ScaleChart from "./ScaleChart.svelte";
  import WordCloud from "./WordCloud.svelte";

  interface Props {
    slide: Slide | PublicSlide;
    results: Results | null;
    state: SlideState;
    theme: Theme;
    leaderboard?: LeaderboardEntry[];
    /** Seconds left on a running quiz question. */
    remaining?: number | null;
    /** Where content-slide pictures are served from. */
    imageUrl?: (id: string) => string;
    /** A small copy, such as a thumbnail: no animation, fewer details. */
    thumbnail?: boolean;
  }

  let {
    slide,
    results,
    state: slideState,
    theme,
    leaderboard = [],
    remaining = null,
    imageUrl = (id: string) => `/media/slides/${id}.webp`,
    thumbnail = false,
  }: Props = $props();

  // A picture that cannot be loaded steps aside rather than leaving an empty frame.
  let brokenImages = $state<string[]>([]);

  const shown = $derived(results && results.type === slide.type ? results : emptyResults(slide.type));
  const phase = $derived(slideState.quiz?.phase ?? "ready");
  const respondents = $derived(
    shown.type === "poll" || shown.type === "quiz" || shown.type === "scale" || shown.type === "wordcloud"
      ? shown.respondents
      : shown.type === "qna"
        ? shown.questions.filter((q) => q.status !== "hidden").length
        : 0,
  );
  const question = $derived(slide.type === "content" ? slide.config.heading : slide.config.question);
  const long = $derived(question.length > 90);
  const quizLimit = $derived(slide.type === "quiz" ? slide.config.timeLimit : 0);

  function kindLabel(): string {
    if (slide.type === "quiz") return `Quiz · ${slide.config.timeLimit} seconds`;
    if (slide.type === "poll" && slide.config.multiple) return "Multiple choice · pick any";
    return SLIDE_TYPE_LABELS[slide.type];
  }
</script>

<div class="frame" style={themeStyle(theme)}>
<section class="stage" class:thumbnail class:dark={theme.dark} aria-label="Slide">
  <div class="glow" aria-hidden="true"></div>

  {#if slide.type === "content"}
    <div class="content {slide.config.layout}" class:with-image={Boolean(slide.config.image) && !brokenImages.includes(slide.config.image ?? "")}>
      <div class="words">
        {#if slide.config.heading}<h2 class="heading">{slide.config.heading}</h2>{/if}
        {#if slide.config.body}<p class="body-text">{slide.config.body}</p>{/if}
      </div>
      {#if slide.config.image && !brokenImages.includes(slide.config.image)}
        {@const image = slide.config.image}
        <div class="picture">
          <img src={imageUrl(image)} alt="" loading="lazy" onerror={() => (brokenImages = [...brokenImages, image])} />
        </div>
      {/if}
    </div>
  {:else}
    <header class="head">
      <p class="kind">{kindLabel()}</p>
      <h2 class="question" class:long>{question || "Your question appears here"}</h2>
    </header>

    <div class="results">
      {#if slide.type === "quiz" && (phase === "ready" || phase === "open")}
        <div class="quiz-open">
          <ol class="tiles">
            {#each slide.config.options as option, i (option.id)}
              <li style={`--color:var(--t-c${i})`}>
                <span class="letter">{String.fromCharCode(65 + i)}</span>
                <span>{option.label}</span>
              </li>
            {/each}
          </ol>
          <div class="timer" aria-live="polite">
            {#if phase === "open"}
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle class="ring-track" cx="50" cy="50" r="44" />
                <circle
                  class="ring"
                  cx="50"
                  cy="50"
                  r="44"
                  style={`--left:${quizLimit ? Math.max(0, (remaining ?? quizLimit) / quizLimit) : 0}`}
                />
              </svg>
              <span class="seconds">{Math.max(0, Math.ceil(remaining ?? quizLimit))}</span>
              <span class="timer-label">{respondents} answered</span>
            {:else}
              <span class="ready">Get ready</span>
              <span class="timer-label">{quizLimit} seconds to answer</span>
            {/if}
          </div>
        </div>
      {:else if slide.type === "quiz" && phase === "leaderboard"}
        <Leaderboard entries={leaderboard} />
      {:else if slideState.resultsHidden && slide.type !== "quiz" && slide.type !== "qna"}
        <div class="hidden-results">
          <Mark size={thumbnail ? 18 : 64} live={!thumbnail} color="var(--t-accent)" />
          <p class="big-count">{respondents}</p>
          <p>{respondents === 1 ? "answer so far" : "answers so far"} · results hidden</p>
        </div>
      {:else if (slide.type === "poll" || slide.type === "quiz") && (shown.type === "poll" || shown.type === "quiz")}
        <BarChart
          options={slide.config.options}
          counts={shown.counts}
          respondents={shown.respondents}
          correctId={slide.type === "quiz" ? slide.config.correctOptionId : null}
          letters={slide.type === "quiz"}
        />
      {:else if slide.type === "scale" && shown.type === "scale"}
        <ScaleChart
          max={slide.config.max}
          counts={shown.counts}
          average={shown.average}
          minLabel={slide.config.minLabel}
          maxLabel={slide.config.maxLabel}
        />
      {:else if slide.type === "wordcloud" && shown.type === "wordcloud"}
        <WordCloud words={shown.words} />
      {:else if slide.type === "qna" && shown.type === "qna"}
        <QuestionWall questions={shown.questions} limit={thumbnail ? 3 : 6} />
      {/if}
    </div>

    <footer class="foot">
      <span class="count">
        <svg viewBox="0 0 16 16" aria-hidden="true"
          ><path
            d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5.5 6.5c.4-2.6 2.7-4.5 5.5-4.5s5.1 1.9 5.5 4.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          /></svg
        >
        {#if shown.type === "wordcloud"}
          {shown.respondents} {shown.respondents === 1 ? "person" : "people"} · {shown.entries} {shown.entries === 1 ? "word" : "words"}
        {:else}
          {respondents}
          {slide.type === "qna" ? (respondents === 1 ? "question" : "questions") : respondents === 1 ? "answer" : "answers"}
        {/if}
      </span>
      {#if slideState.locked}<span class="locked">Answers closed</span>{/if}
    </footer>
  {/if}
</section>
</div>

<style>
  /* The frame is the size container; everything inside, padding included, scales with it. */
  .frame {
    container-type: size;
    width: 100%;
    height: 100%;
  }

  .stage {
    --unit: 1cqw;
    --u: var(--unit);
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr auto;
    width: 100%;
    height: 100%;
    padding: calc(var(--u) * 4.5) calc(var(--u) * 5.5) calc(var(--u) * 3);
    overflow: hidden;
    background: var(--t-bg);
    color: var(--t-text);
    font-family: var(--font-text);
    isolation: isolate;
  }

  .glow {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--t-glow);
    pointer-events: none;
  }

  .dark .glow::after {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--grain);
    opacity: 0.5;
    mix-blend-mode: overlay;
  }

  .head {
    display: grid;
    gap: calc(var(--u) * 1);
    margin-bottom: calc(var(--u) * 3);
  }

  .kind {
    font-size: calc(var(--u) * 1.3);
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--t-accent);
  }

  .question {
    max-width: 30ch;
    font-size: calc(var(--u) * 4.4);
    line-height: 1.04;
    letter-spacing: -0.03em;
  }

  .question.long {
    max-width: 40ch;
    font-size: calc(var(--u) * 3.3);
  }

  .results {
    position: relative;
    min-height: 0;
  }

  .foot {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 1.6);
    margin-top: calc(var(--u) * 2);
    font-size: calc(var(--u) * 1.3);
    color: var(--t-muted);
  }

  .count {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--u) * 0.6);
    font-variant-numeric: tabular-nums;
  }

  .count svg {
    width: calc(var(--u) * 1.5);
    height: calc(var(--u) * 1.5);
  }

  .locked {
    padding: calc(var(--u) * 0.25) calc(var(--u) * 0.9);
    border-radius: 999px;
    border: 1px solid var(--t-line);
  }

  /* Quiz ------------------------------------------------------------ */

  .quiz-open {
    display: grid;
    grid-template-columns: 1fr calc(var(--u) * 22);
    gap: calc(var(--u) * 4);
    height: 100%;
    align-items: center;
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: calc(var(--u) * 1.6);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .tiles li {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 1.4);
    min-height: calc(var(--u) * 9);
    padding: calc(var(--u) * 1.4) calc(var(--u) * 1.8);
    border-radius: calc(var(--u) * 1.4);
    background: var(--color);
    color: var(--t-bg);
    font-size: calc(var(--u) * 2.1);
    font-weight: 700;
    line-height: 1.15;
  }

  .tiles .letter {
    display: grid;
    place-items: center;
    flex: none;
    width: calc(var(--u) * 4);
    height: calc(var(--u) * 4);
    border-radius: calc(var(--u) * 0.9);
    background: color-mix(in srgb, var(--t-bg) 22%, transparent);
    font-family: var(--font-display);
    font-size: calc(var(--u) * 2.2);
  }

  .timer {
    position: relative;
    display: grid;
    place-items: center;
    align-content: center;
    gap: calc(var(--u) * 0.8);
    aspect-ratio: 1;
  }

  .timer svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    transform: rotate(-90deg);
  }

  .ring-track,
  .ring {
    fill: none;
    stroke-width: 7;
  }

  .ring-track {
    stroke: var(--t-track);
  }

  .ring {
    stroke: var(--t-accent);
    stroke-linecap: round;
    stroke-dasharray: 276.5;
    stroke-dashoffset: calc(276.5 * (1 - var(--left)));
    transition: stroke-dashoffset 1s linear;
  }

  .seconds {
    font-family: var(--font-display);
    font-size: calc(var(--u) * 8);
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .ready {
    font-family: var(--font-display);
    font-size: calc(var(--u) * 3);
    font-weight: 700;
    text-align: center;
  }

  .timer-label {
    font-size: calc(var(--u) * 1.3);
    color: var(--t-muted);
    text-align: center;
  }

  /* Hidden results -------------------------------------------------- */

  .hidden-results {
    display: grid;
    place-items: center;
    align-content: center;
    gap: calc(var(--u) * 1.2);
    height: 100%;
    text-align: center;
    color: var(--t-muted);
    font-size: calc(var(--u) * 1.6);
  }

  .big-count {
    font-family: var(--font-display);
    font-size: calc(var(--u) * 10);
    font-weight: 700;
    line-height: 1;
    color: var(--t-text);
  }

  /* Content slides -------------------------------------------------- */

  .content {
    grid-row: 1 / -1;
    display: grid;
    align-items: center;
    height: 100%;
    min-height: 0;
  }

  .content.centre {
    justify-items: center;
    text-align: center;
  }

  .content.split.with-image {
    grid-template-columns: 1fr 1fr;
    gap: calc(var(--u) * 5);
  }

  .content.centre.with-image {
    grid-template-rows: 1fr auto;
    gap: calc(var(--u) * 3);
  }

  .words {
    display: grid;
    gap: calc(var(--u) * 2);
    max-width: calc(var(--u) * 62);
  }

  .heading {
    font-size: calc(var(--u) * 6);
    line-height: 0.98;
    letter-spacing: -0.035em;
  }

  .body-text {
    font-size: calc(var(--u) * 2);
    line-height: 1.45;
    color: var(--t-muted);
  }

  .picture {
    height: 100%;
    min-height: 0;
    border-radius: calc(var(--u) * 2);
    overflow: hidden;
  }

  .centre .picture {
    width: 60%;
    height: calc(var(--u) * 22);
    order: -1;
  }

  .picture {
    background: var(--t-track);
  }

  .picture img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    color: transparent;
    font-size: 0;
  }

  .thumbnail * {
    animation: none !important;
    transition: none !important;
  }
</style>
