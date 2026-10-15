<script lang="ts">
  // One series of daily counts: thin bars with rounded tops on a shared
  // baseline, a hover tooltip on each day, and the same numbers as a table.
  interface Props {
    days: { day: string; count: number }[];
    label: string;
  }

  let { days, label }: Props = $props();

  let hovered = $state<number | null>(null);
  let showTable = $state(false);

  const max = $derived(Math.max(4, ...days.map((d) => d.count)));
  const ticks = $derived.by(() => {
    const step = Math.max(1, Math.ceil(max / 4));
    return Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  });
  const top = $derived(ticks[ticks.length - 1] || 1);
  const peak = $derived(days.reduce((best, d, i) => (d.count > (days[best]?.count ?? -1) ? i : best), 0));

  function short(day: string): string {
    return new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  }

  const W = 640;
  const H = 220;
  const PAD = { left: 32, right: 8, top: 18, bottom: 26 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = $derived(plotW / Math.max(1, days.length));
  const barW = $derived(Math.min(26, slot * 0.6));

  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
</script>

<figure class="daily">
  <figcaption>
    <span>{label}</span>
    <button type="button" class="link-button" onclick={() => (showTable = !showTable)}>{showTable ? "Show chart" : "Show as table"}</button>
  </figcaption>

  {#if showTable}
    <table>
      <thead><tr><th scope="col">Day</th><th scope="col">Sign-ups</th></tr></thead>
      <tbody>
        {#each days as d (d.day)}<tr><td>{short(d.day)}</td><td>{d.count}</td></tr>{/each}
      </tbody>
    </table>
  {:else}
    <div class="plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${days.map((d) => `${short(d.day)} ${d.count}`).join(", ")}`}>
        {#each ticks as tick (tick)}
          <line class="grid" x1={PAD.left} x2={W - PAD.right} y1={y(tick)} y2={y(tick)} />
          <text class="axis" x={PAD.left - 8} y={y(tick) + 4} text-anchor="end">{tick}</text>
        {/each}
        {#each days as d, i (d.day)}
          {@const cx = PAD.left + slot * i + slot / 2}
          {@const h = Math.max(d.count ? 3 : 0, (d.count / top) * plotH)}
          <!-- The hit area is the whole day's column, wider than the bar. -->
          <rect
            class="hit"
            x={PAD.left + slot * i}
            y={PAD.top}
            width={slot}
            height={plotH}
            role="presentation"
            onpointerenter={() => (hovered = i)}
            onpointerleave={() => (hovered = null)}
          />
          {#if h > 0}
            <path
              class="bar"
              class:dim={hovered !== null && hovered !== i}
              d={`M${cx - barW / 2},${PAD.top + plotH} V${PAD.top + plotH - h + 4} q0,-4 4,-4 H${cx + barW / 2 - 4} q4,0 4,4 V${PAD.top + plotH} Z`}
            />
          {/if}
          {#if i === peak && d.count > 0}
            <text class="value" x={cx} y={PAD.top + plotH - h - 6} text-anchor="middle">{d.count}</text>
          {/if}
          {#if i % 3 === 0 || i === days.length - 1}
            <text class="axis" x={cx} y={H - 6} text-anchor="middle">{short(d.day)}</text>
          {/if}
        {/each}
        <line class="baseline" x1={PAD.left} x2={W - PAD.right} y1={PAD.top + plotH} y2={PAD.top + plotH} />
      </svg>
      {#if hovered !== null && days[hovered]}
        <div class="tip" style={`left:clamp(52px, ${((PAD.left + slot * hovered + slot / 2) / W) * 100}%, calc(100% - 52px))`} role="status">
          <strong>{days[hovered]!.count}</strong> {days[hovered]!.count === 1 ? "sign-up" : "sign-ups"}<span>{short(days[hovered]!.day)}</span>
        </div>
      {/if}
    </div>
  {/if}
</figure>

<style>
  .daily {
    margin: 0;
  }

  figcaption {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
    font-weight: 600;
  }

  figcaption .link-button {
    font-size: 0.85rem;
  }

  .plot {
    position: relative;
  }

  svg {
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .grid {
    stroke: var(--line);
    stroke-width: 1;
  }

  .baseline {
    stroke: var(--ink-4);
    stroke-width: 1;
  }

  .axis {
    fill: var(--ink-3);
    font-size: 11px;
    font-family: var(--font-text);
  }

  .value {
    fill: var(--ink);
    font-size: 12px;
    font-weight: 700;
    font-family: var(--font-text);
  }

  .bar {
    fill: var(--signal);
    transition: opacity 120ms ease;
  }

  .bar.dim {
    opacity: 0.4;
  }

  .hit {
    fill: transparent;
  }

  .tip {
    position: absolute;
    top: 0;
    display: grid;
    gap: 1px;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--ink);
    color: var(--paper);
    font-size: 0.82rem;
    white-space: nowrap;
    transform: translate(-50%, -100%);
    pointer-events: none;
  }

  .tip span {
    color: var(--stage-muted);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  th,
  td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
    text-align: left;
  }

  td:last-child,
  th:last-child {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
</style>
