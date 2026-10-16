<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";

  import {
    LIMITS,
    formatJoinCode,
    slideProblems,
    type PresentationDetail,
    type Slide,
    type ThemeId,
  } from "@roomwave/shared";
  import { Logo, SlideView, THEME_LIST, THEMES_BY_ID } from "@roomwave/ui";

  import { get, post, put, RequestError } from "#lib/api.ts";
  import Icon from "#lib/components/Icon.svelte";
  import Menu from "#lib/components/Menu.svelte";
  import Inspector from "#lib/editor/Inspector.svelte";
  import SlideList from "#lib/editor/SlideList.svelte";
  import { previewState, sampleResults } from "#lib/editor/sample.ts";
  import { slideImageUrl } from "#lib/images.ts";
  import { toasts } from "#lib/toast.svelte.ts";

  type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

  const id = $derived(page.params.id!);

  let detail = $state<PresentationDetail | null>(null);
  let loadError = $state("");
  let title = $state("");
  let theme = $state<ThemeId>("paper");
  let slides = $state<Slide[]>([]);
  let version = 0;
  let selected = $state(0);
  let saveState = $state<SaveState>("saved");
  let saveMessage = $state("");
  let showResults = $state(true);
  let presenting = $state(false);

  let lastSaved = "";
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<boolean> | null = null;

  const snapshot = $derived(JSON.stringify({ title, theme, slides }));
  const current = $derived(slides[Math.min(selected, slides.length - 1)]);
  const unfinished = $derived(slides.filter((s) => slideProblems(s).length).length);

  onMount(async () => {
    try {
      ({ presentation: detail } = await get<{ presentation: PresentationDetail }>(`/api/presentations/${id}`));
      title = detail.title;
      theme = detail.theme;
      slides = detail.slides;
      version = detail.version;
      lastSaved = JSON.stringify({ title, theme, slides });
    } catch (error) {
      loadError = error instanceof RequestError ? error.message : "Could not open this presentation.";
    }
  });

  // Save a moment after the last change, and never lose the latest one.
  $effect(() => {
    const now = snapshot;
    if (!detail || now === lastSaved || saveState === "conflict") return;
    saveState = "dirty";
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void save(), 900);
  });

  async function save(): Promise<boolean> {
    if (inFlight) await inFlight;
    const body = snapshot;
    if (body === lastSaved) {
      saveState = "saved";
      return true;
    }
    const doc = JSON.parse(body) as { title: string; theme: ThemeId; slides: Slide[] };
    if (!doc.title.trim()) doc.title = "Untitled presentation";
    saveState = "saving";
    inFlight = (async () => {
      try {
        ({ version } = await put<{ version: number }>(`/api/presentations/${id}`, { doc, version }));
        lastSaved = body;
        saveState = snapshot === body ? "saved" : "dirty";
        if (saveState === "dirty") timer = setTimeout(() => void save(), 300);
        return true;
      } catch (error) {
        if (error instanceof RequestError && error.status === 409) {
          saveState = "conflict";
          saveMessage = error.message;
        } else {
          saveState = "error";
          saveMessage = error instanceof RequestError ? error.message : "Could not save.";
        }
        return false;
      } finally {
        inFlight = null;
      }
    })();
    return inFlight;
  }

  // Warn before leaving with changes that have not reached the server.
  $effect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saveState === "dirty" || saveState === "saving" || saveState === "error") event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  });

  async function present() {
    presenting = true;
    try {
      if (timer) clearTimeout(timer);
      if (!(await save())) {
        toasts.show("Save your changes before presenting.", "error");
        return;
      }
      const firstProblem = slides.findIndex((s) => slideProblems(s).length);
      if (firstProblem >= 0) {
        selected = firstProblem;
        toasts.show(`Slide ${firstProblem + 1} is not finished yet.`, "error");
        return;
      }
      const { sessionId } = await post<{ sessionId: string }>(`/api/presentations/${id}/present`);
      await goto(`/present/${sessionId}`);
    } catch (error) {
      toasts.show(error instanceof RequestError ? error.message : "Could not start presenting.", "error");
    } finally {
      presenting = false;
    }
  }

  const statusText = $derived(
    {
      saved: "All changes saved",
      dirty: "Unsaved changes",
      saving: "Saving…",
      error: "Not saved",
      conflict: "Changed elsewhere",
    }[saveState],
  );
</script>

<svelte:head>
  <title>{title || "Presentation"} · Roomwave</title>
</svelte:head>

{#if loadError}
  <main id="main" class="message">
    <h1>We could not open this presentation</h1>
    <p>{loadError}</p>
    <a class="btn" href="/app">Back to your presentations</a>
  </main>
{:else if !detail || !current}
  <main id="main" class="message" aria-busy="true"><p>Opening…</p></main>
{:else}
  <div class="editor">
    <header class="top">
      <a class="back" href="/app" aria-label="Back to your presentations">
        <Icon name="arrow-left" size={20} />
        <span class="back-logo"><Logo size={18} /></span>
      </a>
      <div class="title-wrap">
        <label class="visually-hidden" for="title">Presentation title</label>
        <input id="title" class="title" bind:value={title} maxlength={LIMITS.title} placeholder="Untitled presentation" />
        <span class="status" class:warn={saveState === "error" || saveState === "conflict"} role="status">
          {#if saveState === "saved"}<Icon name="check" size={14} />{/if}
          {statusText}
        </span>
      </div>
      <div class="tools">
        <Menu label="Choose a theme">
          {#snippet trigger()}
            <span class="swatch" style={`background:${THEMES_BY_ID[theme].background}`}><span style={`background:${THEMES_BY_ID[theme].accent}`}></span></span>
            <span class="tool-label">Theme</span>
          {/snippet}
          {#snippet children(close)}
            {#each THEME_LIST as option (option.id)}
              <button type="button" aria-pressed={theme === option.id} onclick={() => { theme = option.id; close(); }}>
                <span class="swatch" style={`background:${option.background}`}><span style={`background:${option.accent}`}></span></span>
                {option.name}
                {#if theme === option.id}<Icon name="check" size={16} />{/if}
              </button>
            {/each}
          {/snippet}
        </Menu>
        <a class="btn btn-small btn-ghost results-link" href={`/app/presentations/${id}/results`}><Icon name="chart" size={16} /> <span>Results</span></a>
        <button class="btn btn-small btn-signal" type="button" disabled={presenting} onclick={present}>
          <Icon name="play" size={16} filled />
          {detail.live ? "Present (live)" : "Present"}
        </button>
      </div>
    </header>

    {#if saveState === "conflict" || saveState === "error"}
      <div class="notice {saveState === 'conflict' ? 'notice-info' : 'notice-error'} save-problem" role="alert">
        <span>{saveMessage}</span>
        {#if saveState === "conflict"}
          <button class="btn btn-small" type="button" onclick={() => location.reload()}>Reload</button>
        {:else}
          <button class="btn btn-small" type="button" onclick={() => save()}>Try again</button>
        {/if}
      </div>
    {/if}

    {#if detail.live}
      <div class="live-bar">
        <span class="badge badge-live">Live</span>
        <span>Running now with code <strong>{formatJoinCode(detail.live.code)}</strong>. Press Present to pick it up with your changes.</span>
      </div>
    {/if}

    <main id="main" class="body">
      <h1 class="visually-hidden">{title || "Untitled presentation"}</h1>
      <section class="list" aria-label="Slides">
        <SlideList bind:slides bind:selected />
        {#if unfinished}
          <p class="unfinished"><span class="dot"></span> {unfinished} {unfinished === 1 ? "slide needs" : "slides need"} finishing</p>
        {/if}
      </section>

      <section class="preview" aria-label="Preview">
        <div class="preview-bar">
          <span class="eyebrow">Preview</span>
          {#if current.type !== "content"}
            <label class="toggle">
              <input type="checkbox" bind:checked={showResults} />
              <span>Show example answers</span>
            </label>
          {/if}
        </div>
        <div class="screen">
          <SlideView
            slide={current}
            results={showResults ? sampleResults(current) : null}
            state={previewState(current, showResults)}
            theme={THEMES_BY_ID[theme]}
            imageUrl={slideImageUrl}
          />
        </div>
        <p class="hint">This is how the slide looks on the big screen. People answer on their phones.</p>
      </section>

      <section class="inspector" aria-label="Edit slide">
        {#key current.id}
          <Inspector bind:slide={slides[selected] as Slide} number={selected + 1} />
        {/key}
      </section>
    </main>
  </div>
{/if}

<style>
  .message {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 16px;
    min-height: 100dvh;
    padding: 24px;
    text-align: center;
  }

  /* A column, so the slide area fills what is left whichever notices are showing above it. */
  .editor {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: var(--paper);
  }

  .top {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 64px;
    padding: 8px 20px;
    border-bottom: 1px solid var(--line);
    background: var(--card);
  }

  .back {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px 8px 8px;
    border-radius: var(--radius-pill);
    color: var(--ink-2);
    text-decoration: none;
  }

  .back:hover {
    background: var(--paper-2);
  }

  .title-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
  }

  .title {
    flex: 0 1 420px;
    min-width: 0;
    height: 42px;
    padding: 0 10px;
    border: 1.5px solid transparent;
    border-radius: var(--radius-s);
    background: transparent;
    font-family: var(--font-display);
    font-size: 1.2rem;
    font-weight: 700;
    letter-spacing: -0.015em;
  }

  .title:hover {
    border-color: var(--line);
  }

  .title:focus {
    outline: none;
    border-color: var(--ink);
    background: var(--card);
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.85rem;
    color: var(--ink-3);
    white-space: nowrap;
  }

  .status.warn {
    color: var(--danger);
    font-weight: 600;
  }

  .tools {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tools :global(.menu-button) {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 12px 0 8px;
    border: 1.5px solid var(--line-strong);
    border-radius: var(--radius-pill);
    background: transparent;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
  }

  .swatch {
    position: relative;
    display: inline-block;
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.12);
  }

  .swatch span {
    position: absolute;
    right: 3px;
    bottom: 3px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .save-problem,
  .live-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    margin: 12px 20px 0;
  }

  .live-bar {
    padding: 10px 14px;
    border-radius: var(--radius-m);
    background: var(--ink);
    color: var(--paper);
    font-size: 0.92rem;
  }

  .body {
    flex: 1;
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr) 360px;
    min-height: 0;
  }

  .list,
  .inspector {
    min-height: 0;
    overflow-y: auto;
    padding: 20px;
  }

  .list {
    border-right: 1px solid var(--line);
  }

  .inspector {
    border-left: 1px solid var(--line);
    background: var(--card);
  }

  .unfinished {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 14px;
    font-size: 0.85rem;
    color: var(--ink-3);
  }

  .unfinished .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--sun);
  }

  .preview {
    display: grid;
    grid-template-rows: auto auto auto;
    align-content: center;
    gap: 14px;
    min-width: 0;
    min-height: 0;
    padding: 24px clamp(16px, 3vw, 40px);
    overflow-y: auto;
  }

  .preview-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
  }

  .toggle input {
    width: 18px;
    height: 18px;
    accent-color: var(--ink);
  }

  .screen {
    aspect-ratio: 16 / 9;
    width: 100%;
    border-radius: var(--radius-m);
    overflow: hidden;
    box-shadow: var(--shadow-3);
  }

  .preview .hint {
    text-align: center;
  }

  @media (max-width: 1180px) {
    .body {
      grid-template-columns: 240px minmax(0, 1fr);
      grid-template-rows: auto auto;
      overflow-y: auto;
    }

    .list {
      grid-row: span 2;
    }

    .preview {
      align-content: start;
      overflow: visible;
    }

    .inspector {
      overflow: visible;
      border-left: 0;
      border-top: 1px solid var(--line);
    }
  }

  @media (max-width: 760px) {
    .editor {
      height: auto;
      min-height: 100dvh;
    }

    .top {
      flex-wrap: wrap;
      padding: 8px 12px;
      gap: 8px;
    }

    .back-logo,
    .tool-label,
    .results-link span,
    .status {
      display: none;
    }

    .title-wrap {
      order: 3;
      flex-basis: 100%;
    }

    .title {
      flex: 1;
    }

    .tools {
      margin-left: auto;
    }

    .body {
      grid-template-columns: minmax(0, 1fr);
      overflow: visible;
    }

    .list {
      grid-row: auto;
      border-right: 0;
      border-bottom: 1px solid var(--line);
      padding: 14px 12px;
    }

    .preview {
      padding: 16px 12px;
    }

    .inspector {
      padding: 20px 12px 48px;
    }
  }
</style>
