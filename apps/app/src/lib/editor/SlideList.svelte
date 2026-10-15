<script lang="ts">
  import { LIMITS, SLIDE_TYPES, SLIDE_TYPE_LABELS, blankSlide, newId, slideProblems, slideTitle, type Slide, type SlideType } from "@roomwave/shared";

  import Icon from "../components/Icon.svelte";
  import { toasts } from "../toast.svelte.ts";
  import Menu from "../components/Menu.svelte";
  import TypeIcon from "../components/TypeIcon.svelte";

  interface Props {
    slides: Slide[];
    selected: number;
  }

  let { slides = $bindable(), selected = $bindable() }: Props = $props();

  const DESCRIPTIONS: Record<SlideType, string> = {
    poll: "Pick one or more answers",
    wordcloud: "Short answers grow with each vote",
    scale: "Rate from 1 to 5, 7 or 10",
    qna: "Questions with upvotes",
    quiz: "Timed, with points and a leaderboard",
    content: "A heading, some text, a picture",
  };

  let dragging = $state<number | null>(null);
  let over = $state<number | null>(null);

  function add(type: SlideType) {
    if (slides.length >= LIMITS.slides) return;
    const at = selected + 1;
    slides.splice(at, 0, blankSlide(type));
    selected = at;
  }

  function duplicate(index: number) {
    if (slides.length >= LIMITS.slides) return;
    const copy = structuredClone($state.snapshot(slides[index]!)) as Slide;
    copy.id = newId(12);
    if (copy.type === "poll" || copy.type === "quiz") {
      const ids = new Map(copy.config.options.map((o) => [o.id, newId(6)]));
      copy.config.options = copy.config.options.map((o) => ({ ...o, id: ids.get(o.id)! }));
      if (copy.type === "quiz") copy.config.correctOptionId = ids.get(copy.config.correctOptionId)!;
    }
    slides.splice(index + 1, 0, copy);
    selected = index + 1;
  }

  function remove(index: number) {
    if (slides.length <= 1) return;
    const [gone] = slides.splice(index, 1);
    selected = Math.max(0, Math.min(selected, slides.length - 1));
    // A slip of the finger should not cost a slide: it can come back for a few seconds.
    toasts.show(`Slide ${index + 1} deleted.`, "info", 8000, {
      label: "Undo",
      run: () => {
        if (!gone || slides.length >= LIMITS.slides) return;
        slides.splice(Math.min(index, slides.length), 0, gone);
        selected = Math.min(index, slides.length - 1);
      },
    });
  }

  function move(from: number, to: number) {
    if (to < 0 || to >= slides.length || from === to) return;
    const [slide] = slides.splice(from, 1);
    slides.splice(to, 0, slide!);
    selected = to;
  }
</script>

<div class="list-wrap">
  <ol class="slides" aria-label="Slides">
    {#each slides as slide, i (slide.id)}
      {@const unfinished = slideProblems(slide).length > 0}
      <li
        class:selected={i === selected}
        class:dragging={dragging === i}
        class:over={over === i && dragging !== null && dragging !== i}
        draggable="true"
        ondragstart={(event) => {
          dragging = i;
          event.dataTransfer?.setData("text/plain", String(i));
          if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
        }}
        ondragover={(event) => {
          event.preventDefault();
          over = i;
        }}
        ondragleave={() => (over = over === i ? null : over)}
        ondrop={(event) => {
          event.preventDefault();
          if (dragging !== null) move(dragging, i);
          dragging = null;
          over = null;
        }}
        ondragend={() => {
          dragging = null;
          over = null;
        }}
      >
        <button type="button" class="pick" aria-current={i === selected ? "true" : undefined} onclick={() => (selected = i)}>
          <span class="number">{i + 1}</span>
          <span class="icon"><TypeIcon type={slide.type} size={18} /></span>
          <span class="title">
            <span class="kind">{SLIDE_TYPE_LABELS[slide.type]}</span>
            <span class="words">{slideTitle(slide) || "Untitled"}</span>
          </span>
          {#if unfinished}<span class="dot" title="Not finished yet" aria-label="Not finished yet"></span>{/if}
        </button>
        <Menu label={`Slide ${i + 1} options`}>
          {#snippet trigger()}<Icon name="more" size={18} />{/snippet}
          {#snippet children(close)}
            <button type="button" disabled={i === 0} onclick={() => { close(); move(i, i - 1); }}><Icon name="chevron-up" size={18} /> Move up</button>
            <button type="button" disabled={i === slides.length - 1} onclick={() => { close(); move(i, i + 1); }}><Icon name="chevron-down" size={18} /> Move down</button>
            <button type="button" onclick={() => { close(); duplicate(i); }}><Icon name="copy" size={18} /> Duplicate</button>
            <hr />
            <button type="button" class="danger" disabled={slides.length <= 1} onclick={() => { close(); remove(i); }}><Icon name="trash" size={18} /> Delete slide</button>
          {/snippet}
        </Menu>
      </li>
    {/each}
  </ol>

  <Menu label="Add a slide" align="start" buttonClass="btn btn-ghost btn-block add-slide">
    {#snippet trigger()}<Icon name="plus" size={18} /> Add a slide{/snippet}
    {#snippet children(close)}
      {#each SLIDE_TYPES as type (type)}
        <button type="button" class="type-choice" onclick={() => { close(); add(type); }}>
          <span class="type-icon"><TypeIcon {type} size={20} /></span>
          <span class="type-text"><strong>{SLIDE_TYPE_LABELS[type]}</strong><span>{DESCRIPTIONS[type]}</span></span>
        </button>
      {/each}
    {/snippet}
  </Menu>
</div>

<style>
  .list-wrap {
    display: grid;
    gap: 12px;
    align-content: start;
  }

  .slides {
    display: grid;
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    position: relative;
    display: flex;
    align-items: center;
    border: 1.5px solid transparent;
    border-radius: var(--radius-m);
    background: var(--card);
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease;
  }

  li:hover {
    border-color: var(--line-strong);
  }

  li.selected {
    border-color: var(--ink);
    box-shadow: var(--shadow-1);
  }

  li.dragging {
    opacity: 0.4;
  }

  li.over {
    box-shadow: 0 -3px 0 var(--signal);
  }

  .pick {
    flex: 1;
    display: grid;
    grid-template-columns: 22px 30px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 10px 4px 10px 10px;
    border: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .number {
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--ink-3);
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .icon {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: var(--paper-2);
    color: var(--ink-2);
  }

  .selected .icon {
    background: var(--signal);
    color: var(--ink);
  }

  .title {
    display: grid;
    min-width: 0;
  }

  .kind {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .words {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.92rem;
    font-weight: 500;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--sun);
    box-shadow: 0 0 0 2px var(--card);
  }

  li :global(.menu-button) {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    margin-right: 4px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--ink-3);
    cursor: pointer;
  }

  li :global(.menu-button:hover) {
    background: var(--paper-2);
    color: var(--ink);
  }

  .list-wrap :global(.add-slide) {
    width: 100%;
  }

  .list-wrap > :global(.menu) {
    display: flex;
  }

  .type-choice {
    align-items: flex-start !important;
  }

  .type-icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 34px;
    height: 34px;
    border-radius: 9px;
    background: var(--paper-2);
  }

  .type-text {
    display: grid;
    gap: 1px;
  }

  .type-text span {
    font-size: 0.82rem;
    font-weight: 400;
    color: var(--ink-3);
  }
</style>
