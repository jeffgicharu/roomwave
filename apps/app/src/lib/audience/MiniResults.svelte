<script lang="ts">
  import type { Results, Slide } from "@roomwave/shared";

  // What the room said so far, small enough for a phone.
  let { slide, results }: { slide: Slide; results: Results | null } = $props();

  const rows = $derived.by(() => {
    if (!results) return [];
    if (results.type === "poll" && slide.type === "poll") {
      // The same colour for each answer as on the big screen.
      return slide.config.options.map((o, i) => ({ label: o.label, count: results.counts[o.id] ?? 0, of: results.respondents, color: `var(--t-c${i % 6})` }));
    }
    if (results.type === "scale" && slide.type === "scale") {
      return Array.from({ length: slide.config.max }, (_, i) => ({
        label: String(i + 1),
        count: results.counts[String(i + 1)] ?? 0,
        of: results.respondents,
        color: "var(--t-accent)",
      }));
    }
    if (results.type === "wordcloud") {
      const top = results.words[0]?.count ?? 1;
      return results.words.slice(0, 6).map((w) => ({ label: w.text, count: w.count, of: top, color: "var(--t-accent)" }));
    }
    return [];
  });
  const most = $derived(Math.max(1, ...rows.map((r) => r.count)));
</script>

{#if rows.length}
  <section class="mini" aria-label="Results so far">
    <h3>
      {#if results?.type === "scale" && results.average !== null}
        Average {results.average.toFixed(1)}
      {:else}
        The room so far
      {/if}
    </h3>
    <ul class:compact={slide.type === "scale"}>
      {#each rows as row (row.label)}
        <li style={`--share:${row.count / most};--any:${row.count ? 1 : 0};--c:${row.color}`}>
          <span class="label">{row.label}</span>
          <span class="track"><span class="fill"></span></span>
          <span class="value">{results?.type === "wordcloud" ? row.count : `${row.of ? Math.round((row.count / row.of) * 100) : 0}%`}</span>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .mini {
    margin-top: 20px;
    padding: 16px;
    border-radius: 16px;
    background: var(--t-surface);
    border: 1px solid var(--t-line);
  }

  h3 {
    margin-bottom: 12px;
    font-size: 1rem;
    letter-spacing: -0.01em;
  }

  ul {
    display: grid;
    gap: 14px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The answer reads in full on its own line, with its bar below. */
  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      "label value"
      "track track";
    align-items: center;
    gap: 6px 12px;
    font-size: 0.92rem;
  }

  /* Ratings are single numbers, so each fits on one row. */
  .compact li {
    grid-template-columns: 28px minmax(0, 1fr) 44px;
    grid-template-areas: "label track value";
    gap: 10px;
  }

  .label {
    grid-area: label;
    overflow-wrap: anywhere;
  }

  .track {
    grid-area: track;
    height: 10px;
    border-radius: 999px;
    background: var(--t-track);
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--c);
    transform-origin: 0 50%;
    transform: scaleX(max(var(--share), calc(0.02 * var(--any))));
    transition: transform 500ms var(--ease-spring);
  }

  .value {
    grid-area: value;
    text-align: right;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
