<script lang="ts">
  import type { LeaderboardEntry } from "@roomwave/shared";

  interface Props {
    entries: LeaderboardEntry[];
    title?: string;
  }

  let { entries, title = "Leaderboard" }: Props = $props();
  const top = $derived(Math.max(1, entries[0]?.score ?? 1));
</script>

<div class="board">
  <h3>{title}</h3>
  {#if entries.length}
    <ol>
      {#each entries as entry, i (entry.participantId)}
        <li class:podium={entry.rank <= 3} style={`--share:${entry.score / top};--delay:${i * 70}ms`}>
          <span class="rank">{entry.rank}</span>
          <span class="name">{entry.name}</span>
          <span class="bar" aria-hidden="true"><span></span></span>
          <span class="score">{entry.score.toLocaleString("en-KE")}</span>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="empty">Nobody has scored yet.</p>
  {/if}
</div>

<style>
  .board {
    --u: var(--unit, 1cqw);
    display: grid;
    align-content: start;
    gap: calc(var(--u) * 1.6);
    height: 100%;
    color: var(--t-text, var(--ink));
  }

  h3 {
    font-size: calc(var(--u) * 3.2);
  }

  ol {
    display: grid;
    gap: calc(var(--u) * 0.7);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: grid;
    grid-template-columns: calc(var(--u) * 3.4) minmax(0, 1.3fr) minmax(0, 1fr) calc(var(--u) * 9);
    align-items: center;
    gap: calc(var(--u) * 1.4);
    padding: calc(var(--u) * 0.55) calc(var(--u) * 1);
    border-radius: calc(var(--u) * 1);
    font-size: calc(var(--u) * 1.75);
    animation: slide 500ms var(--ease-out, ease-out) both;
    animation-delay: var(--delay);
  }

  li.podium {
    background: var(--t-surface, var(--card));
    font-size: calc(var(--u) * 2);
  }

  .rank {
    display: grid;
    place-items: center;
    width: calc(var(--u) * 3.2);
    height: calc(var(--u) * 3.2);
    border-radius: 50%;
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--t-muted, var(--ink-3));
  }

  .podium .rank {
    background: var(--t-accent, var(--signal));
    color: var(--t-on-accent, var(--ink));
  }

  .name {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bar {
    height: calc(var(--u) * 1.1);
    border-radius: 999px;
    background: var(--t-track, var(--paper-2));
    overflow: hidden;
  }

  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--t-accent, var(--signal));
    transform-origin: 0 50%;
    transform: scaleX(var(--share));
    transition: transform 700ms var(--ease-spring, ease-out);
  }

  .score {
    text-align: right;
    font-family: var(--font-display);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .empty {
    color: var(--t-muted, var(--ink-3));
    font-size: calc(var(--u) * 1.8);
  }

  @keyframes slide {
    from {
      opacity: 0;
      transform: translateX(calc(var(--u) * -2));
    }
  }
</style>
