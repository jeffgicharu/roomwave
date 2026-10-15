<script lang="ts">
  import type { Question } from "@roomwave/shared";

  interface Props {
    questions: Question[];
    /** How many to show on the big screen. */
    limit?: number;
    hint?: string;
  }

  let { questions, limit = 6, hint = "No questions yet. Send one from your phone." }: Props = $props();

  const live = $derived(questions.filter((q) => q.status === "live").slice(0, limit));
  const answered = $derived(questions.filter((q) => q.status === "answered").length);
</script>

<div class="wall">
  {#if live.length}
    <ol>
      {#each live as question, i (question.id)}
        <li class:top={i === 0}>
          <span class="votes" aria-label={`${question.upvotes} upvotes`}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3 14 11H2z" fill="currentColor" /></svg>
            {question.upvotes}
          </span>
          <p class="text">{question.text}</p>
          {#if question.name}<span class="name">{question.name}</span>{/if}
        </li>
      {/each}
    </ol>
  {:else}
    <p class="empty">{answered ? "Every question so far has been answered. Ask another from your phone." : hint}</p>
  {/if}
  {#if answered}
    <p class="answered">{answered} answered</p>
  {/if}
</div>

<style>
  .wall {
    --u: var(--unit, 1cqw);
    display: grid;
    grid-template-rows: 1fr auto;
    height: 100%;
    min-height: 0;
    color: var(--t-text, var(--ink));
  }

  ol {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-content: start;
    gap: calc(var(--u) * 1.4);
    margin: 0;
    padding: 0;
    list-style: none;
    min-height: 0;
    overflow: hidden;
  }

  li {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    column-gap: calc(var(--u) * 1.4);
    align-items: start;
    padding: calc(var(--u) * 1.4) calc(var(--u) * 1.6);
    border-radius: calc(var(--u) * 1.4);
    background: var(--t-surface, var(--card));
    border: 1px solid var(--t-line, var(--line));
    animation: in 450ms var(--ease-out, ease-out);
  }

  li.top {
    grid-column: 1 / -1;
    border-color: var(--t-accent, var(--signal));
    box-shadow: 0 0 0 calc(var(--u) * 0.2) var(--t-accent, var(--signal));
  }

  .votes {
    grid-row: span 2;
    display: grid;
    justify-items: center;
    gap: calc(var(--u) * 0.2);
    min-width: calc(var(--u) * 4);
    padding: calc(var(--u) * 0.5) calc(var(--u) * 0.6);
    border-radius: calc(var(--u) * 0.9);
    background: var(--t-track, var(--paper-2));
    font-family: var(--font-display);
    font-size: calc(var(--u) * 1.9);
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .top .votes {
    background: var(--t-accent, var(--signal));
    color: var(--t-on-accent, var(--ink));
  }

  .votes svg {
    width: calc(var(--u) * 1.3);
    height: calc(var(--u) * 1.3);
  }

  .text {
    font-size: calc(var(--u) * 1.75);
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .top .text {
    font-family: var(--font-display);
    font-size: calc(var(--u) * 2.5);
    letter-spacing: -0.015em;
  }

  .name {
    margin-top: calc(var(--u) * 0.4);
    font-size: calc(var(--u) * 1.2);
    color: var(--t-muted, var(--ink-3));
  }

  .empty {
    align-self: center;
    text-align: center;
    color: var(--t-muted, var(--ink-3));
    font-size: calc(var(--u) * 1.9);
  }

  .answered {
    margin-top: calc(var(--u) * 1);
    font-size: calc(var(--u) * 1.25);
    color: var(--t-muted, var(--ink-3));
  }

  @keyframes in {
    from {
      opacity: 0;
      transform: translateY(calc(var(--u) * 1.5));
    }
  }
</style>
