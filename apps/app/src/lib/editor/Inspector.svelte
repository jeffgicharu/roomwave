<script lang="ts">
  import { LIMITS, SLIDE_TYPE_LABELS, newId, slideProblems, type Slide } from "@roomwave/shared";

  import Icon from "../components/Icon.svelte";
  import Segmented from "../components/Segmented.svelte";
  import TypeIcon from "../components/TypeIcon.svelte";
  import { SLIDE_IMAGES, slideThumbUrl } from "../images.ts";

  let { slide = $bindable(), number }: { slide: Slide; number: number } = $props();

  const problems = $derived(slideProblems(slide));
  const id = $derived(slide.id);

  function addOption() {
    if (slide.type !== "poll" && slide.type !== "quiz") return;
    const max = slide.type === "poll" ? LIMITS.pollOptionsMax : LIMITS.quizOptionsMax;
    if (slide.config.options.length >= max) return;
    slide.config.options.push({ id: newId(6), label: "" });
    // Put the cursor in the new answer.
    queueMicrotask(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>(".option-input");
      inputs[inputs.length - 1]?.focus();
    });
  }

  function removeOption(optionId: string) {
    if (slide.type !== "poll" && slide.type !== "quiz") return;
    const min = slide.type === "poll" ? LIMITS.pollOptionsMin : LIMITS.quizOptionsMin;
    if (slide.config.options.length <= min) return;
    slide.config.options = slide.config.options.filter((o) => o.id !== optionId);
    if (slide.type === "quiz" && slide.config.correctOptionId === optionId) {
      slide.config.correctOptionId = slide.config.options[0]!.id;
    }
  }
</script>

<div class="inspector">
  <header>
    <span class="type"><TypeIcon type={slide.type} size={18} /> Slide {number} · {SLIDE_TYPE_LABELS[slide.type]}</span>
  </header>

  {#if problems.length}
    <p class="notice notice-info problems">
      <Icon name="flag" size={18} />
      <span>To present this slide: {problems.join(", ").toLowerCase()}.</span>
    </p>
  {/if}

  {#if slide.type === "content"}
    <div class="field">
      <label class="label" for={`${id}-heading`}>Heading</label>
      <input id={`${id}-heading`} class="input" bind:value={slide.config.heading} maxlength={LIMITS.heading} />
    </div>
    <div class="field">
      <label class="label" for={`${id}-body`}>Text</label>
      <textarea id={`${id}-body`} class="textarea" bind:value={slide.config.body} maxlength={LIMITS.body} rows="4"></textarea>
      <span class="hint counter">{slide.config.body.length} / {LIMITS.body}</span>
    </div>
    <fieldset class="field pictures">
      <legend class="label">Picture</legend>
      <div class="picture-grid">
        <label class="picture none" class:on={slide.config.image === null}>
          <input type="radio" name={`${id}-image`} checked={slide.config.image === null} onchange={() => slide.type === "content" && (slide.config.image = null)} />
          <span>None</span>
        </label>
        {#each SLIDE_IMAGES as image (image.id)}
          <label class="picture" class:on={slide.config.image === image.id} title={image.label}>
            <input
              type="radio"
              name={`${id}-image`}
              checked={slide.config.image === image.id}
              onchange={() => slide.type === "content" && (slide.config.image = image.id)}
            />
            <img src={slideThumbUrl(image.id)} alt={image.label} loading="lazy" />
          </label>
        {/each}
      </div>
    </fieldset>
    {#if slide.config.image}
      <div class="field">
        <Segmented
          label="Layout"
          name={`${id}-layout`}
          bind:value={slide.config.layout}
          options={[
            { value: "split", label: "Picture beside" },
            { value: "centre", label: "Picture above" },
          ]}
        />
      </div>
    {/if}
  {:else}
    <div class="field">
      <label class="label" for={`${id}-question`}>{slide.type === "qna" ? "What should people ask about?" : "Question"}</label>
      <textarea
        id={`${id}-question`}
        class="textarea question"
        bind:value={slide.config.question}
        maxlength={LIMITS.question}
        rows="2"
        placeholder={slide.type === "wordcloud" ? "Describe this week in one word" : "Ask your audience something"}
      ></textarea>
      <span class="hint counter">{slide.config.question.length} / {LIMITS.question}</span>
    </div>

    {#if slide.type === "poll" || slide.type === "quiz"}
      <fieldset class="field">
        <legend class="label">{slide.type === "quiz" ? "Answers: tick the correct one" : "Answers"}</legend>
        <ol class="options">
          {#each slide.config.options as option, i (option.id)}
            <li>
              {#if slide.type === "quiz"}
                <label class="correct" title="Correct answer">
                  <input
                    type="radio"
                    name={`${id}-correct`}
                    checked={slide.config.correctOptionId === option.id}
                    onchange={() => slide.type === "quiz" && (slide.config.correctOptionId = option.id)}
                    aria-label={`Answer ${String.fromCharCode(65 + i)} is correct`}
                  />
                  <span><Icon name="check" size={16} /></span>
                </label>
              {:else}
                <span class="letter" aria-hidden="true">{String.fromCharCode(65 + i)}</span>
              {/if}
              <input
                class="input option-input"
                bind:value={option.label}
                maxlength={LIMITS.optionLabel}
                placeholder={`Answer ${String.fromCharCode(65 + i)}`}
                aria-label={`Answer ${String.fromCharCode(65 + i)}`}
              />
              <button
                type="button"
                class="remove"
                aria-label={`Remove answer ${String.fromCharCode(65 + i)}`}
                disabled={slide.config.options.length <= (slide.type === "poll" ? LIMITS.pollOptionsMin : LIMITS.quizOptionsMin)}
                onclick={() => removeOption(option.id)}
              >
                <Icon name="x" size={16} />
              </button>
            </li>
          {/each}
        </ol>
        {#if slide.config.options.length < (slide.type === "poll" ? LIMITS.pollOptionsMax : LIMITS.quizOptionsMax)}
          <button type="button" class="btn btn-small btn-ghost add" onclick={addOption}><Icon name="plus" size={16} /> Add an answer</button>
        {/if}
      </fieldset>
    {/if}

    {#if slide.type === "poll"}
      <label class="check">
        <input type="checkbox" bind:checked={slide.config.multiple} />
        <span>Let people choose more than one answer</span>
      </label>
    {:else if slide.type === "quiz"}
      <div class="field">
        <Segmented
          label="Time to answer"
          name={`${id}-time`}
          bind:value={slide.config.timeLimit}
          options={[10, 20, 30, 45, 60].map((s) => ({ value: s as 10 | 20 | 30 | 45 | 60, label: `${s}s` }))}
        />
        <span class="hint">Faster correct answers score more: 1,000 points at once, 500 at the buzzer.</span>
      </div>
    {:else if slide.type === "wordcloud"}
      <div class="field">
        <Segmented
          label="Answers each person can send"
          name={`${id}-entries`}
          bind:value={slide.config.maxEntries}
          options={[1, 2, 3].map((n) => ({ value: n, label: String(n) }))}
        />
        <span class="hint">Each answer can be up to three words. Offensive words are refused before they reach the screen.</span>
      </div>
    {:else if slide.type === "scale"}
      <div class="field">
        <Segmented
          label="Scale"
          name={`${id}-max`}
          bind:value={slide.config.max}
          options={[5, 7, 10].map((n) => ({ value: n as 5 | 7 | 10, label: `1 to ${n}` }))}
        />
      </div>
      <div class="pair">
        <div class="field">
          <label class="label" for={`${id}-min`}>Label for 1</label>
          <input id={`${id}-min`} class="input" bind:value={slide.config.minLabel} maxlength={LIMITS.scaleLabel} />
        </div>
        <div class="field">
          <label class="label" for={`${id}-maxl`}>Label for {slide.config.max}</label>
          <input id={`${id}-maxl`} class="input" bind:value={slide.config.maxLabel} maxlength={LIMITS.scaleLabel} />
        </div>
      </div>
    {:else if slide.type === "qna"}
      <label class="check">
        <input type="checkbox" bind:checked={slide.config.moderate} />
        <span>Approve each question before it appears on the screen</span>
      </label>
      <label class="check">
        <input type="checkbox" bind:checked={slide.config.allowNames} />
        <span>Let people add their name to a question</span>
      </label>
      <p class="hint">People can upvote each other's questions. Offensive words are refused.</p>
    {/if}
  {/if}
</div>

<style>
  .inspector {
    display: grid;
    gap: 20px;
    align-content: start;
  }

  header .type {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.82rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .problems {
    align-items: center;
    font-size: 0.9rem;
  }

  .field + .field {
    margin-top: 0;
  }

  fieldset.field {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  legend {
    margin-bottom: 0.4rem;
    padding: 0;
  }

  .question {
    min-height: 72px;
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 600;
    line-height: 1.3;
  }

  .counter {
    justify-self: end;
  }

  .options {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .options li {
    display: grid;
    grid-template-columns: 36px 1fr 36px;
    align-items: center;
    gap: 8px;
  }

  .letter {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--paper-2);
    font-weight: 700;
    color: var(--ink-2);
  }

  .correct {
    position: relative;
    display: grid;
    place-items: center;
    cursor: pointer;
  }

  .correct input {
    position: absolute;
    opacity: 0;
  }

  .correct span {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 2px solid var(--line-strong);
    border-radius: 50%;
    color: transparent;
  }

  .correct input:checked + span {
    border-color: var(--lagoon);
    background: var(--lagoon);
    color: #fff;
  }

  .correct input:focus-visible + span {
    outline: 3px solid var(--signal);
    outline-offset: 2px;
  }

  .remove {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--ink-3);
    cursor: pointer;
  }

  .remove:hover:not(:disabled) {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .remove:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .add {
    justify-self: start;
    margin-top: 4px;
  }

  .check {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    font-weight: 500;
    cursor: pointer;
  }

  .check input {
    flex: none;
    width: 20px;
    height: 20px;
    margin-top: 2px;
    accent-color: var(--ink);
  }

  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .picture-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
    gap: 8px;
  }

  .picture {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 4 / 3;
    border: 2px solid transparent;
    border-radius: 10px;
    background: var(--paper-2);
    overflow: hidden;
    cursor: pointer;
  }

  .picture.none {
    border-color: var(--line);
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--ink-3);
  }

  .picture img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    /* A picture that fails to load shows its tile, not its alt text. */
    color: transparent;
    font-size: 0;
  }

  .picture.on {
    border-color: var(--signal);
    box-shadow: 0 0 0 2px var(--signal);
  }

  .picture input {
    position: absolute;
    opacity: 0;
  }

  .picture:has(input:focus-visible) {
    outline: 3px solid var(--signal);
    outline-offset: 2px;
  }
</style>
