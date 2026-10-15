<script lang="ts">
  import { onMount, untrack } from "svelte";

  import { estimateWidth, layoutWords, type CloudWord, type Measure, type PlacedWord } from "../wordcloud-layout.ts";

  interface Props {
    words: CloudWord[];
    /** Shown when nobody has sent a word yet. */
    empty?: string;
  }

  let { words, empty = "Words will appear here as people send them." }: Props = $props();

  let width = $state(0);
  let height = $state(0);
  let fontsReady = $state(false);
  let measure: Measure = estimateWidth;

  onMount(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      measure = (text, size) => {
        context.font = `700 ${size}px "Bricolage Grotesque Variable", sans-serif`;
        return context.measureText(text).width;
      };
    }
    // Widths measured before the font arrives would be wrong; lay out again once it has.
    document.fonts?.ready.then(() => (fontsReady = true));
  });

  // At most a few layouts a second, however fast words arrive.
  let placed: PlacedWord[] = $state([]);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRun = 0;

  $effect(() => {
    const input = words;
    const w = width;
    const h = height;
    void fontsReady;
    const run = () => {
      lastRun = Date.now();
      timer = null;
      // Read without subscribing: the layout must not re-run because it ran.
      const previous = untrack(() => new Map(placed.map((p) => [p.text, { x: p.x, y: p.y }])));
      placed = layoutWords(input, w, h, measure, previous);
    };
    if (timer) clearTimeout(timer);
    const wait = Math.max(0, 350 - (Date.now() - lastRun));
    if (wait === 0) run();
    else timer = setTimeout(run, wait);
    return () => {
      if (timer) clearTimeout(timer);
    };
  });
</script>

<div class="cloud" bind:clientWidth={width} bind:clientHeight={height}>
  {#if !words.length}
    <p class="empty">{empty}</p>
  {:else}
    <ul aria-label="Words sent">
      {#each placed as word (word.text)}
        <li
          style={`--x:${word.x - word.width / 2}px;--y:${word.y - word.height / 2}px;--size:${word.size}px;--w:${word.width}px;--h:${word.height}px;--color:var(--t-c${word.rank % 6})`}
          title={`${word.text}: ${word.count}`}
        >
          {word.text}
        </li>
      {/each}
    </ul>
    <p class="visually-hidden">
      {words
        .slice(0, 10)
        .map((w) => `${w.text} (${w.count})`)
        .join(", ")}
    </p>
  {/if}
</div>

<style>
  .cloud {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 120px;
    overflow: hidden;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    position: absolute;
    left: 0;
    top: 0;
    width: var(--w);
    height: var(--h);
    display: grid;
    place-items: center;
    font-family: var(--font-display);
    font-size: var(--size);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
    white-space: nowrap;
    color: var(--color);
    transform: translate(var(--x), var(--y));
    transition:
      transform 420ms var(--ease-out, ease-out),
      font-size 420ms var(--ease-out, ease-out);
    animation: arrive 500ms var(--ease-spring, ease-out);
  }

  @keyframes arrive {
    from {
      opacity: 0;
      scale: 0.4;
    }
  }

  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 1rem;
    text-align: center;
    color: var(--t-muted, var(--ink-3));
    font-size: calc(var(--unit, 1cqw) * 1.8);
  }
</style>
