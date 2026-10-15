<script lang="ts">
  interface Props {
    max: number;
    counts: Record<string, number>;
    average: number | null;
    minLabel: string;
    maxLabel: string;
  }

  let { max, counts, average, minLabel, maxLabel }: Props = $props();

  const values = $derived(Array.from({ length: max }, (_, i) => i + 1));
  const top = $derived(Math.max(1, ...values.map((v) => counts[String(v)] ?? 0)));
  // Where the average sits along the row of columns, from 0 to 1.
  const marker = $derived(average === null ? null : (average - 1) / Math.max(1, max - 1));
</script>

<div class="scale">
  <div class="summary">
    <span class="average">{average === null ? "–" : average.toFixed(1)}</span>
    <span class="of">average out of {max}</span>
  </div>

  <div class="plot" style={`--n:${max}`}>
    <div class="columns">
      {#each values as value (value)}
        {@const count = counts[String(value)] ?? 0}
        <div class="column" style={`--share:${count / top};--delay:${value * 40}ms`}>
          <span class="count">{count}</span>
          <div class="track"><div class="fill"></div></div>
          <span class="value">{value}</span>
        </div>
      {/each}
    </div>
    {#if marker !== null}
      <div class="marker" style={`--at:${marker}`} aria-hidden="true"><span>▲</span></div>
    {/if}
    <div class="ends">
      <span>{minLabel}</span>
      <span>{maxLabel}</span>
    </div>
  </div>
</div>

<style>
  .scale {
    --u: var(--unit, 1cqw);
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: stretch;
    gap: calc(var(--u) * 4);
    width: 100%;
    height: 100%;
    color: var(--t-text, var(--ink));
  }

  .summary {
    display: grid;
    align-content: center;
    gap: calc(var(--u) * 0.6);
  }

  .average {
    font-family: var(--font-display);
    font-size: calc(var(--u) * 9);
    font-weight: 700;
    letter-spacing: -0.04em;
    line-height: 0.9;
    color: var(--t-accent, var(--signal));
    font-variant-numeric: tabular-nums;
  }

  .of {
    font-size: max(var(--min-text, 0px), calc(var(--u) * 1.4));
    color: var(--t-muted, var(--ink-3));
    line-height: 1.35;
  }

  .plot {
    position: relative;
    display: grid;
    grid-template-rows: 1fr auto auto;
    min-height: 0;
  }

  .columns {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: calc(var(--u) * 1);
    min-height: 0;
  }

  .column {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: calc(var(--u) * 0.6);
    text-align: center;
    min-height: 0;
  }

  .count {
    font-size: max(var(--min-text, 0px), calc(var(--u) * 1.3));
    color: var(--t-muted, var(--ink-3));
    font-variant-numeric: tabular-nums;
  }

  .track {
    position: relative;
    min-height: calc(var(--u) * 4);
    border-radius: calc(var(--u) * 0.8);
    background: var(--t-track, var(--paper-2));
    overflow: hidden;
  }

  .fill {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--t-accent, var(--signal));
    transform-origin: 50% 100%;
    transform: scaleY(max(var(--share), 0.02));
    transition: transform 700ms var(--ease-spring, cubic-bezier(0.34, 1.42, 0.64, 1)) var(--delay);
  }

  .value {
    font-family: var(--font-display);
    font-size: max(var(--min-text, 0px), calc(var(--u) * 1.7));
    font-weight: 700;
  }

  .marker {
    position: relative;
    height: calc(var(--u) * 1.8);
    /* The first and last column centres are the ends of the line. */
    margin-inline: calc((100% - var(--u) * (var(--n) - 1)) / var(--n) / 2);
  }

  .marker span {
    position: absolute;
    left: calc(var(--at) * 100%);
    transform: translateX(-50%);
    font-size: calc(var(--u) * 1.4);
    line-height: 1;
    color: var(--t-accent, var(--signal));
    transition: left 700ms var(--ease-spring, ease);
  }

  .ends {
    display: flex;
    justify-content: space-between;
    gap: calc(var(--u) * 2);
    font-size: max(var(--min-text, 0px), calc(var(--u) * 1.35));
    font-weight: 600;
    color: var(--t-muted, var(--ink-3));
  }

  .ends span:last-child {
    text-align: right;
  }
</style>
