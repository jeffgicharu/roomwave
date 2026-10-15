<script lang="ts">
  import { page } from "$app/state";
  import { onMount } from "svelte";

  import { formatJoinCode, type PresentationDetail, type SessionSummary } from "@roomwave/shared";

  import { get, RequestError } from "#lib/api.ts";
  import Icon from "#lib/components/Icon.svelte";
  import { formatDateTime, plural } from "#lib/format.ts";

  const id = $derived(page.params.id!);
  let presentation = $state<PresentationDetail | null>(null);
  let sessions = $state<SessionSummary[] | null>(null);
  let message = $state("");

  onMount(async () => {
    try {
      const [p, s] = await Promise.all([
        get<{ presentation: PresentationDetail }>(`/api/presentations/${id}`),
        get<{ sessions: SessionSummary[] }>(`/api/presentations/${id}/sessions`),
      ]);
      presentation = p.presentation;
      sessions = s.sessions;
    } catch (error) {
      message = error instanceof RequestError ? error.message : "Could not load the results.";
    }
  });

  function duration(session: SessionSummary): string {
    if (!session.endedAt) return "Running now";
    const minutes = Math.max(1, Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 60_000));
    return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }
</script>

<svelte:head>
  <title>Results{presentation ? ` · ${presentation.title}` : ""} · Roomwave</title>
</svelte:head>

<nav class="crumbs" aria-label="Breadcrumb">
  <a href="/app">Presentations</a>
  <Icon name="chevron-right" size={14} />
  {#if presentation}<a href={`/app/presentations/${id}`}>{presentation.title}</a><Icon name="chevron-right" size={14} />{/if}
  <span aria-current="page">Results</span>
</nav>

{#if message}
  <p class="notice notice-error" role="alert">{message}</p>
{:else if !presentation || !sessions}
  <p class="loading" aria-busy="true">Loading…</p>
{:else}
  <header class="head">
    <div>
      <h1>Results</h1>
      <p class="sub">Every time you present <strong>{presentation.title}</strong>, its answers are kept here.</p>
    </div>
    <a class="btn btn-ghost" href={`/app/presentations/${id}`}><Icon name="edit" size={16} /> Edit presentation</a>
  </header>

  {#if !sessions.length}
    <div class="empty">
      <h2>No sessions yet</h2>
      <p>Present it to a room and the answers will appear here.</p>
      <a class="btn btn-signal" href={`/app/presentations/${id}`}>Open the presentation</a>
    </div>
  {:else}
    <ul class="sessions">
      {#each sessions as session (session.id)}
        <li>
          <a href={`/app/presentations/${id}/sessions/${session.id}`}>
            <span class="when">
              <strong>{formatDateTime(session.startedAt)}</strong>
              <span>Code {formatJoinCode(session.code)} · {duration(session)}</span>
            </span>
            <span class="stat"><strong>{session.participants}</strong> {session.participants === 1 ? "person" : "people"}</span>
            <span class="stat"><strong>{session.responses}</strong> {session.responses === 1 ? "answer" : "answers"}</span>
            {#if !session.endedAt}<span class="badge badge-live">Live</span>{:else}<span class="badge">Ended</span>{/if}
            <Icon name="chevron-right" size={20} />
          </a>
        </li>
      {/each}
    </ul>
    <p class="hint total">{plural(sessions.length, "session")}</p>
  {/if}
{/if}

<style>
  .crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-bottom: 20px;
    font-size: 0.9rem;
    color: var(--ink-3);
  }

  .crumbs a {
    color: var(--ink-2);
  }

  .head {
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

  .sub {
    margin-top: 8px;
    color: var(--ink-3);
  }

  .sessions {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .sessions a {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 120px 120px 80px 24px;
    align-items: center;
    gap: 16px;
    padding: 18px 20px;
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    background: var(--card);
    text-decoration: none;
    transition:
      border-color 150ms ease,
      box-shadow 150ms ease;
  }

  .sessions a:hover {
    border-color: var(--ink-4);
    box-shadow: var(--shadow-2);
  }

  .when {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .when span,
  .stat {
    font-size: 0.9rem;
    color: var(--ink-3);
  }

  .stat strong {
    font-family: var(--font-display);
    font-size: 1.2rem;
    color: var(--ink);
  }

  .empty {
    display: grid;
    justify-items: center;
    gap: 10px;
    padding: 56px 24px;
    border: 2px dashed var(--line-strong);
    border-radius: var(--radius-l);
    text-align: center;
  }

  .empty p,
  .loading {
    color: var(--ink-3);
  }

  .total {
    margin-top: 14px;
  }

  @media (max-width: 720px) {
    .sessions a {
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px 12px;
    }

    .when {
      grid-column: 1 / -1;
    }

    .sessions a > :global(svg) {
      display: none;
    }
  }
</style>
