<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";

  import { PLANS, TEMPLATES, formatJoinCode, type PresentationSummary } from "@roomwave/shared";
  import { THEMES_BY_ID, themeStyle } from "@roomwave/ui";

  import { del, get, post, RequestError } from "#lib/api.ts";
  import Dialog from "#lib/components/Dialog.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Menu from "#lib/components/Menu.svelte";
  import { plural, timeAgo } from "#lib/format.ts";
  import { session } from "#lib/session.svelte.ts";
  import { toasts } from "#lib/toast.svelte.ts";

  let presentations = $state<PresentationSummary[] | null>(null);
  let loadError = $state("");
  let choosing = $state(false);
  let creating = $state<string | null>(null);
  let deleting = $state<PresentationSummary | null>(null);
  let confirmOpen = $state(false);
  let limitMessage = $state("");
  let limitOpen = $state(false);
  let starting = $state<string | null>(null);

  const welcome = $derived(page.url.searchParams.get("welcome"));

  async function load() {
    loadError = "";
    try {
      ({ presentations } = await get<{ presentations: PresentationSummary[] }>("/api/presentations"));
    } catch (error) {
      loadError = error instanceof RequestError ? error.message : "Could not load your presentations.";
    }
  }

  onMount(load);

  function handleLimit(error: unknown): boolean {
    if (error instanceof RequestError && error.code === "plan_limit") {
      limitMessage = error.message;
      limitOpen = true;
      return true;
    }
    return false;
  }

  // A full Free plan says so before a template is picked; the server checks again either way.
  function startNew() {
    const plan = session.user?.plan.plan;
    const limit = plan ? PLANS[plan].presentations : null;
    if (limit !== null && presentations && presentations.length >= limit) {
      limitMessage = `The Free plan holds ${limit} presentations. Delete one, or start a Pro trial for unlimited presentations.`;
      limitOpen = true;
      return;
    }
    choosing = true;
  }

  async function create(template: string) {
    creating = template;
    try {
      const { id } = await post<{ id: string }>("/api/presentations", { template });
      choosing = false;
      await session.load();
      await goto(`/app/presentations/${id}`);
    } catch (error) {
      choosing = false;
      if (!handleLimit(error)) toasts.show(error instanceof RequestError ? error.message : "Could not create it.", "error");
    } finally {
      creating = null;
    }
  }

  async function duplicate(item: PresentationSummary) {
    try {
      await post(`/api/presentations/${item.id}/duplicate`);
      toasts.show(`Made a copy of “${item.title}”.`);
      await Promise.all([load(), session.load()]);
    } catch (error) {
      if (!handleLimit(error)) toasts.show(error instanceof RequestError ? error.message : "Could not copy it.", "error");
    }
  }

  async function confirmDelete() {
    const item = deleting;
    if (!item) return;
    try {
      await del(`/api/presentations/${item.id}`);
      confirmOpen = false;
      toasts.show(`Deleted “${item.title}”.`);
      await Promise.all([load(), session.load()]);
    } catch (error) {
      confirmOpen = false;
      toasts.show(error instanceof RequestError ? error.message : "Could not delete it.", "error");
    }
  }

  async function present(item: PresentationSummary) {
    starting = item.id;
    try {
      const { sessionId } = await post<{ sessionId: string }>(`/api/presentations/${item.id}/present`);
      await goto(`/present/${sessionId}`);
    } catch (error) {
      toasts.show(error instanceof RequestError ? error.message : "Could not start the presentation.", "error");
      if (error instanceof RequestError && error.code === "unfinished") await goto(`/app/presentations/${item.id}`);
    } finally {
      starting = null;
    }
  }
</script>

<svelte:head>
  <title>Presentations · Roomwave</title>
</svelte:head>

{#if welcome && presentations?.length}
  <section class="welcome">
    <div>
      <p class="eyebrow">{welcome === "guest" && session.user?.isGuest ? "Your guest workspace" : "Welcome to Roomwave"}</p>
      <h2>Your sample presentation is ready.</h2>
      <p>
        Press <strong>Present</strong>, then scan the code on the screen with your phone and answer. Watch the results move on
        this screen as you tap.
      </p>
    </div>
    <button class="btn btn-signal btn-large" type="button" disabled={starting !== null} onclick={() => presentations && present(presentations[presentations.length - 1]!)}>
      <Icon name="play" size={18} filled /> Present it now
    </button>
  </section>
{/if}

<div class="heading">
  <div>
    <h1>Presentations</h1>
    {#if presentations}
      <p class="count">
        {plural(presentations.length, "presentation")}
        {#if session.user?.plan.plan === "free"} · the Free plan holds 5{/if}
      </p>
    {/if}
  </div>
  <button class="btn btn-signal" type="button" onclick={startNew}><Icon name="plus" size={18} /> New presentation</button>
</div>

{#if loadError}
  <div class="notice notice-error" role="alert">
    {loadError}
    <button class="link-button" type="button" onclick={load}>Try again</button>
  </div>
{:else if !presentations}
  <div class="grid" aria-busy="true">
    {#each [1, 2, 3] as n (n)}<div class="card skeleton"></div>{/each}
  </div>
{:else if !presentations.length}
  <div class="empty">
    <h2>Nothing here yet</h2>
    <p>Start from a template or a blank page. Your first question takes a minute.</p>
    <button class="btn btn-signal btn-large" type="button" onclick={startNew}><Icon name="plus" size={18} /> New presentation</button>
  </div>
{:else}
  <ul class="grid">
    {#each presentations as item (item.id)}
      <li class="card">
        <a class="thumb" href={`/app/presentations/${item.id}`} style={themeStyle(THEMES_BY_ID[item.theme])} aria-label={`Edit ${item.title}`}>
          <span class="thumb-glow" aria-hidden="true"></span>
          <span class="thumb-q">{item.firstQuestion || "No questions yet"}</span>
          <span class="thumb-bars" aria-hidden="true">
            {#each [0.55, 0.85, 0.4, 0.7] as h, i (i)}<span style={`--h:${h};--c:var(--t-c${i})`}></span>{/each}
          </span>
          {#if item.live}<span class="badge badge-live thumb-live">Live · {formatJoinCode(item.live.code)}</span>{/if}
        </a>
        <div class="meta">
          <div class="text">
            <h2><a href={`/app/presentations/${item.id}`}>{item.title}</a></h2>
            <p>{plural(item.slideCount, "slide")} · edited {timeAgo(item.updatedAt)}</p>
          </div>
          <Menu label={`More for ${item.title}`}>
            {#snippet trigger()}<Icon name="more" size={22} />{/snippet}
            {#snippet children(close)}
              <a href={`/app/presentations/${item.id}`} onclick={close}><Icon name="edit" size={18} /> Edit</a>
              <a href={`/app/presentations/${item.id}/results`} onclick={close}><Icon name="chart" size={18} /> Results ({item.sessionCount})</a>
              <button type="button" onclick={() => { close(); duplicate(item); }}><Icon name="copy" size={18} /> Make a copy</button>
              <hr />
              <button type="button" class="danger" onclick={() => { close(); deleting = item; confirmOpen = true; }}>
                <Icon name="trash" size={18} /> Delete
              </button>
            {/snippet}
          </Menu>
        </div>
        <div class="card-actions">
          <button class="btn btn-small" type="button" disabled={starting !== null} onclick={() => present(item)}>
            <Icon name="play" size={16} filled /> {item.live ? "Back to presenting" : "Present"}
          </button>
          <a class="btn btn-small btn-ghost" href={`/app/presentations/${item.id}/results`}>Results</a>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<Dialog bind:open={choosing} title="New presentation" description="Pick a starting point. You can change everything afterwards." wide>
  <ul class="templates">
    {#each TEMPLATES as template (template.id)}
      <li>
        <button type="button" class="template" disabled={creating !== null} onclick={() => create(template.id)} style={themeStyle(THEMES_BY_ID[template.theme])}>
          <span class="swatch" aria-hidden="true">
            <span class="swatch-glow"></span>
            <span class="swatch-count">{template.slides.length}<small>{template.slides.length === 1 ? "slide" : "slides"}</small></span>
          </span>
          <span class="template-text">
            <strong>{template.name}</strong>
            <span>{creating === template.id ? "Creating…" : template.description}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
</Dialog>

<Dialog bind:open={confirmOpen} title="Delete this presentation?" description={deleting ? `“${deleting.title}” and the results of every session it ran will be deleted. This cannot be undone.` : ""}>
  <p class="hint">If you only want to tidy up, you can keep it: presentations you do not open cost nothing.</p>
  {#snippet actions()}
    <button class="btn btn-ghost" type="button" onclick={() => (confirmOpen = false)}>Keep it</button>
    <button class="btn btn-danger" type="button" onclick={confirmDelete}>Delete</button>
  {/snippet}
</Dialog>

<Dialog bind:open={limitOpen} title="Your Free plan is full" description={limitMessage}>
  <p class="hint">A Pro trial is free for 14 days and needs no card.</p>
  {#snippet actions()}
    <button class="btn btn-ghost" type="button" onclick={() => (limitOpen = false)}>Not now</button>
    <a class="btn btn-signal" href="/app/billing">See the Pro trial</a>
  {/snippet}
</Dialog>

<style>
  .welcome {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 20px 32px;
    margin-bottom: 36px;
    padding: clamp(20px, 4vw, 32px);
    border-radius: var(--radius-l);
    background: var(--stage);
    background-image: radial-gradient(70% 90% at 100% 0%, rgb(255 122 61 / 0.35), transparent 60%), var(--grain);
    color: var(--stage-text);
  }

  .welcome .eyebrow {
    color: var(--signal);
  }

  .welcome h2 {
    margin: 8px 0;
    font-size: var(--step-3);
  }

  .welcome p:last-child {
    max-width: 52ch;
    color: var(--stage-muted);
  }

  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 28px;
  }

  h1 {
    font-size: var(--step-4);
  }

  .count {
    margin-top: 6px;
    color: var(--ink-3);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
    gap: 24px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: grid;
    grid-template-rows: auto 1fr auto;
    border: 1px solid var(--line);
    border-radius: var(--radius-l);
    background: var(--card);
    box-shadow: var(--shadow-1);
    transition:
      box-shadow 200ms ease,
      transform 200ms var(--ease-out);
  }

  .card:hover {
    box-shadow: var(--shadow-2);
    transform: translateY(-2px);
  }

  /* A card's open menu reaches over the card below it, so that card sits above its neighbours. */
  .card:has(:global([aria-expanded="true"])) {
    position: relative;
    z-index: 3;
  }

  .skeleton {
    min-height: 300px;
    background: linear-gradient(90deg, var(--paper-2), var(--card), var(--paper-2));
    background-size: 200% 100%;
    animation: shimmer 1.4s linear infinite;
  }

  .thumb {
    position: relative;
    display: grid;
    align-content: space-between;
    aspect-ratio: 16 / 9;
    padding: 18px 20px;
    border-radius: calc(var(--radius-l) - 1px) calc(var(--radius-l) - 1px) 0 0;
    background: var(--t-bg);
    color: var(--t-text);
    text-decoration: none;
    overflow: hidden;
    isolation: isolate;
  }

  .thumb-glow {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--t-glow);
  }

  .thumb-q {
    max-width: 22ch;
    font-family: var(--font-display);
    font-size: 1.25rem;
    font-weight: 700;
    line-height: 1.08;
    letter-spacing: -0.02em;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .thumb-bars {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    height: 44px;
  }

  .thumb-bars span {
    width: 18px;
    height: calc(var(--h) * 100%);
    border-radius: 5px 5px 2px 2px;
    background: var(--c);
  }

  .thumb-live {
    position: absolute;
    top: 14px;
    right: 14px;
  }

  .meta {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
    padding: 16px 12px 0 20px;
  }

  .text {
    min-width: 0;
  }

  .meta h2 {
    font-size: 1.15rem;
    line-height: 1.25;
    letter-spacing: -0.015em;
    overflow-wrap: anywhere;
  }

  .meta h2 a {
    text-decoration: none;
  }

  .meta h2 a:hover {
    text-decoration: underline;
  }

  .meta p {
    margin-top: 4px;
    font-size: 0.88rem;
    color: var(--ink-3);
  }

  .meta :global(.menu-button) {
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--ink-3);
    cursor: pointer;
  }

  .meta :global(.menu-button:hover) {
    background: var(--paper-2);
    color: var(--ink);
  }

  .card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 16px 20px 20px;
  }

  .empty {
    display: grid;
    justify-items: center;
    gap: 12px;
    padding: 64px 24px;
    border: 2px dashed var(--line-strong);
    border-radius: var(--radius-l);
    text-align: center;
  }

  .empty p {
    color: var(--ink-3);
    margin-bottom: 8px;
  }

  .templates {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
    gap: 14px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .template {
    display: grid;
    grid-template-columns: 64px 1fr;
    align-items: center;
    gap: 14px;
    width: 100%;
    height: 100%;
    padding: 12px;
    border: 1.5px solid var(--line);
    border-radius: var(--radius-m);
    background: var(--card);
    text-align: left;
    cursor: pointer;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease;
  }

  .template:hover:not(:disabled) {
    border-color: var(--ink);
    box-shadow: var(--shadow-2);
  }

  .template:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .swatch {
    position: relative;
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border-radius: 12px;
    background: var(--t-bg);
    overflow: hidden;
    isolation: isolate;
  }

  .swatch-glow {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--t-glow);
  }

  .swatch-count {
    display: grid;
    justify-items: center;
    font-family: var(--font-display);
    font-size: 1.4rem;
    font-weight: 700;
    line-height: 1;
    color: var(--t-accent);
  }

  .swatch-count small {
    margin-top: 3px;
    font-family: var(--font-text);
    font-size: 0.62rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--t-muted);
  }

  .template-text {
    display: grid;
    gap: 2px;
  }

  .template-text span {
    font-size: 0.88rem;
    color: var(--ink-3);
  }

  @keyframes shimmer {
    to {
      background-position: -200% 0;
    }
  }
</style>
