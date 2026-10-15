<script lang="ts">
  interface Option {
    id: string;
    label: string;
  }

  interface Props {
    options: Option[];
    counts: Record<string, number>;
    /** People who answered: percentages are of them. */
    respondents: number;
    layout?: "auto" | "columns" | "rows";
    /** For a revealed quiz: the correct option stands out, the rest step back. */
    correctId?: string | null;
    /** Letters A, B, C… beside each answer, as on the phones. */
    letters?: boolean;
  }

  let { options, counts, respondents, layout = "auto", correctId = null, letters = false }: Props = $props();

  const max = $derived(Math.max(1, ...options.map((o) => counts[o.id] ?? 0)));
  const resolved = $derived(
    layout === "auto"
      ? options.length > 5 || options.some((o) => o.label.length > 24)
        ? "rows"
        : "columns"
      : layout,
  );

  function count(id: string): number {
    return counts[id] ?? 0;
  }

  function percent(id: string): number {
    return respondents ? Math.round((count(id) / respondents) * 100) : 0;
  }

  function color(index: number, id: string): string {
    if (correctId) return id === correctId ? "var(--t-correct, #14a098)" : "var(--t-muted, #9a90a6)";
    return `var(--t-c${index % 6}, #ff6a2b)`;
  }
</script>

<div class="chart {resolved}" class:revealed={Boolean(correctId)} role="list">
  {#each options as option, i (option.id)}
    {@const share = count(option.id) / max}
    <div
      class="item"
      class:correct={correctId === option.id}
      class:wrong={correctId !== null && correctId !== option.id}
      role="listitem"
      style={`--share:${share};--any:${count(option.id) ? 1 : 0};--color:${color(i, option.id)};--delay:${i * 60}ms`}
    >
      {#if resolved === "columns"}
        <div class="value">
          <span class="percent">{percent(option.id)}%</span>
          <span class="count">{count(option.id)}</span>
        </div>
        <div class="track"><div class="fill"></div></div>
        <div class="label">
          {#if letters}<span class="letter">{String.fromCharCode(65 + i)}</span>{/if}
          {option.label}
          {#if correctId === option.id}<span class="tick" aria-label="Correct answer">✓</span>{/if}
        </div>
      {:else}
        <div class="label">
          {#if letters}<span class="letter">{String.fromCharCode(65 + i)}</span>{/if}
          <span class="text">{option.label}</span>
          {#if correctId === option.id}<span class="tick" aria-label="Correct answer">✓</span>{/if}
        </div>
        <div class="track"><div class="fill"></div></div>
        <div class="value">
          <span class="percent">{percent(option.id)}%</span>
          <span class="count">{count(option.id)}</span>
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .chart {
    --u: var(--unit, 1cqw);
    width: 100%;
    height: 100%;
    color: var(--t-text, var(--ink));
  }

  /* Columns: the classic big-screen look. */
  .columns {
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: calc(var(--u) * 2.4);
    min-height: 0;
  }

  .columns .item {
    flex: 1 1 0;
    max-width: calc(var(--u) * 17);
    min-width: 0;
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: calc(var(--u) * 0.9);
    text-align: center;
  }

  .columns .value {
    display: grid;
    gap: calc(var(--u) * 0.1);
  }

  .columns .percent {
    font-family: var(--font-display);
    font-size: calc(var(--u) * 3.6);
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .columns .count {
    font-size: max(var(--min-text, 0px), calc(var(--u) * 1.3));
    color: var(--t-muted, var(--ink-3));
    font-variant-numeric: tabular-nums;
  }

  .columns .track {
    position: relative;
    min-height: calc(var(--u) * 6);
    border-radius: calc(var(--u) * 1.2) calc(var(--u) * 1.2) calc(var(--u) * 0.4) calc(var(--u) * 0.4);
    background: var(--t-track, var(--paper-2));
    overflow: hidden;
  }

  .columns .fill {
    position: absolute;
    inset: 0;
    background: var(--color);
    border-radius: inherit;
    transform-origin: 50% 100%;
    transform: scaleY(max(var(--share), calc(0.015 * var(--any))));
    transition: transform 700ms var(--ease-spring, cubic-bezier(0.34, 1.42, 0.64, 1)) var(--delay),
      background-color 300ms ease;
  }

  .columns .label {
    font-size: calc(var(--u) * 1.55);
    font-weight: 600;
    line-height: 1.2;
    overflow-wrap: anywhere;
  }

  /* Rows: for long answers and many options. */
  .rows {
    display: grid;
    align-content: center;
    gap: calc(var(--u) * 1.3);
  }

  .rows .item {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.5fr) calc(var(--u) * 10);
    align-items: center;
    gap: calc(var(--u) * 1.6);
  }

  .rows .label {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 0.8);
    font-size: calc(var(--u) * 1.7);
    font-weight: 600;
    line-height: 1.2;
    min-width: 0;
  }

  .rows .text {
    overflow-wrap: anywhere;
  }

  .rows .track {
    position: relative;
    height: calc(var(--u) * 3.2);
    border-radius: var(--radius-pill, 999px);
    background: var(--t-track, var(--paper-2));
    overflow: hidden;
  }

  .rows .fill {
    position: absolute;
    inset: 0;
    background: var(--color);
    border-radius: inherit;
    transform-origin: 0 50%;
    transform: scaleX(max(var(--share), calc(0.012 * var(--any))));
    transition: transform 700ms var(--ease-spring, cubic-bezier(0.34, 1.42, 0.64, 1)) var(--delay),
      background-color 300ms ease;
  }

  .rows .value {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: calc(var(--u) * 0.7);
    white-space: nowrap;
  }

  .rows .percent {
    font-family: var(--font-display);
    font-size: calc(var(--u) * 2.4);
    font-weight: 700;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .rows .count {
    font-size: max(var(--min-text, 0px), calc(var(--u) * 1.25));
    color: var(--t-muted, var(--ink-3));
    font-variant-numeric: tabular-nums;
  }

  .letter {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 1.6em;
    height: 1.6em;
    border-radius: 0.45em;
    background: var(--color);
    color: var(--t-bg, #fff);
    font-size: 0.8em;
    font-weight: 700;
  }

  .tick {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 1.35em;
    height: 1.35em;
    border-radius: 50%;
    background: var(--t-correct, #14a098);
    color: var(--t-bg, #fff);
    font-size: 0.85em;
    font-weight: 800;
  }

  .columns .tick {
    margin-left: 0.3em;
    vertical-align: 0.1em;
  }

  .wrong {
    opacity: 0.55;
  }

  .correct .label {
    color: var(--t-correct, #14a098);
  }

  .revealed .item {
    transition: opacity 300ms ease;
  }
</style>
