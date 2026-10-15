<script lang="ts">
  import type { Question } from "@roomwave/shared";

  interface Props {
    questions: Question[];
    /** How many to show on the big screen. */
    limit?: number;
    hint?: string;
  }

  let { questions, limit = 6, hint = "No questions yet. Send one from your phone." }: Props = $props();

  const allLive = $derived(questions.filter((q) => q.status === "live"));
  const live = $derived(allLive.slice(0, limit));
  const answered = $derived(questions.filter((q) => q.status === "answered").length);

  // Only whole cards are shown: one that would be cut off by the bottom of the
  // screen steps aside, and the line below says how many more there are.
  let list: HTMLOListElement | undefined = $state();
  let fitting = $state<number | null>(null);
  const shown = $derived(fitting === null ? live.length : Math.min(fitting, live.length));
  const more = $derived(allLive.length - shown);

  $effect(() => {
    if (!list) return;
    void live.length;
    const element = list;
    const measure = () => {
      const bottom = element.clientHeight + 1;
      let count = 0;
      for (const child of element.children) {
        const item = child as HTMLElement;
        if (item.offsetTop + item.offsetHeight > bottom) break;
        count += 1;
      }
      fitting = count;
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  });
</script>

<div class="wall">
  {#if live.length}
    <ol bind:this={list}>
      {#each live as question, i (question.id)}
        <li class:top={i === 0} class:cut={i >= shown} aria-hidden={i >= shown ? "true" : undefined}>
          <span class="votes" aria-label={`${question.upvotes} upvotes`}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3 14 11H2z" fill="currentColor" /></svg>
            {question.upvotes}
          </span>
          <div class="body">
            <p class="text">{question.text}</p>
            {#if question.name}<span class="name">{question.name}</span>{/if}
          </div>
        </li>
      {/each}
    </ol>
  {:else}
    <p class="empty">{answered ? "Every question so far has been answered. Ask another from your phone." : hint}</p>
  {/if}
  {#if answered || more > 0}
    <p class="foot">
      {#if more > 0}{more} more {more === 1 ? "question" : "questions"}{/if}{#if more > 0 && answered}&nbsp;·&nbsp;{/if}{#if answered}{answered} answered{/if}
    </p>
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
    position: relative;
  }

  /* Flex rather than grid: a grid sized the clamped text as three lines however short it was. */
  li {
    display: flex;
    gap: calc(var(--u) * 1.4);
    align-items: flex-start;
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

  li.cut {
    visibility: hidden;
  }

  .body {
    display: grid;
    min-width: 0;
  }

  .votes {
    flex: none;
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

  .foot {
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
