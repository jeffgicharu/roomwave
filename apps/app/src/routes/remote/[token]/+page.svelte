<script lang="ts">
  import { page } from "$app/state";
  import { onMount } from "svelte";

  import {
    SLIDE_TYPE_LABELS,
    formatJoinCode,
    slideTitle,
    type LeaderboardEntry,
    type LiveView,
    type Results,
    type Slide,
  } from "@roomwave/shared";
  import { SlideView, THEMES_BY_ID } from "@roomwave/ui";

  import Icon from "#lib/components/Icon.svelte";
  import { plural } from "#lib/format.ts";
  import { slideImageUrl } from "#lib/images.ts";
  import { hostSocket, ServerClock, type HostSocket } from "#lib/live.ts";
  import { toasts } from "#lib/toast.svelte.ts";

  const token = $derived(page.params.token!);

  let socket: HostSocket | null = null;
  const clock = new ServerClock();
  let view = $state<LiveView | null>(null);
  let slides = $state<Slide[]>([]);
  let results = $state<Record<string, Results>>({});
  let boards = $state<Record<string, LeaderboardEntry[]>>({});
  let participants = $state(0);
  let connected = $state(false);
  let problem = $state("");
  let ended = $state(false);
  let now = $state(Date.now());

  const slide = $derived(view?.slide ?? null);
  const slideResults = $derived(slide ? (results[slide.id] ?? null) : null);
  const remaining = $derived(
    view?.state.quiz?.phase === "open" && view.state.quiz.endsAt ? Math.max(0, (view.state.quiz.endsAt - now) / 1000) : null,
  );
  const questions = $derived(slideResults?.type === "qna" ? slideResults.questions.filter((q) => q.status !== "hidden") : []);

  function attach() {
    socket?.emit("attach", { remoteToken: token }, (reply) => {
      if (!reply.ok) {
        problem = "This remote has stopped working. The session may have ended.";
        return;
      }
      clock.sync(reply.snapshot.view.serverNow);
      view = reply.snapshot.view;
      slides = reply.snapshot.slides;
      results = reply.snapshot.results;
      participants = reply.snapshot.participants;
      problem = "";
    });
  }

  onMount(() => {
    socket = hostSocket();
    socket.on("connect", () => {
      connected = true;
      attach();
    });
    socket.on("disconnect", () => (connected = false));
    socket.on("view", (next) => {
      clock.sync(next.serverNow);
      view = next;
    });
    socket.on("results", (id, next) => (results = { ...results, [id]: next }));
    socket.on("leaderboard", (id, entries) => (boards = { ...boards, [id]: entries }));
    socket.on("participants", (count) => (participants = count));
    socket.on("ended", () => (ended = true));
    const tick = setInterval(() => (now = clock.now()), 250);
    return () => {
      clearInterval(tick);
      socket?.disconnect();
    };
  });

  function send(event: "go" | "update" | "quiz" | "moderate", payload: Record<string, unknown>) {
    if (!socket?.connected) return toasts.show("Reconnecting… try again in a moment.", "info");
    (socket.emit as (e: string, p: unknown, ack: (r: { ok: boolean }) => void) => void)(event, payload, (reply) => {
      if (!reply.ok) toasts.show("That did not work. Try again.", "error");
      else if (navigator.vibrate) navigator.vibrate(12);
    });
  }
</script>

<svelte:head>
  <title>Remote · Roomwave</title>
</svelte:head>

<main id="main" class="remote">
  {#if problem}
    <div class="centre"><h1>{problem}</h1><a class="btn btn-signal" href="/app">Your presentations</a></div>
  {:else if ended}
    <div class="centre"><h1>The session has ended</h1><p>Every answer is saved in the results.</p></div>
  {:else if !view || !slide}
    <div class="centre"><p>Connecting…</p></div>
  {:else}
    <header class="head">
      <div>
        <p class="eyebrow">Remote · code {formatJoinCode(view.code)}</p>
        <h1>{view.title}</h1>
      </div>
      <span class="people"><Icon name="users" size={18} /> {participants}</span>
    </header>
    {#if !connected}<p class="banner">Reconnecting…</p>{/if}

    <div class="screen">
      <SlideView slide={slide} results={slideResults} state={view.state} theme={THEMES_BY_ID[view.theme]} {remaining} leaderboard={boards[slide.id] ?? []} imageUrl={slideImageUrl} />
    </div>

    <div class="nav">
      <button type="button" class="big" disabled={view.slideIndex === 0} onclick={() => send("go", { index: view!.slideIndex - 1 })}><Icon name="chevron-left" size={28} /><span>Back</span></button>
      <span class="pos">{view.slideIndex + 1}<small>/ {view.slideCount}</small></span>
      <button type="button" class="big next" disabled={view.slideIndex >= view.slideCount - 1} onclick={() => send("go", { index: view!.slideIndex + 1 })}><span>Next</span><Icon name="chevron-right" size={28} /></button>
    </div>

    <div class="actions">
      {#if slide.type === "quiz"}
        {@const phase = view.state.quiz?.phase ?? "ready"}
        {#if phase === "ready"}<button type="button" class="btn btn-signal btn-block" onclick={() => send("quiz", { slideId: slide.id, action: "start" })}>Start the timer</button>{/if}
        {#if phase === "open"}<button type="button" class="btn btn-signal btn-block" onclick={() => send("quiz", { slideId: slide.id, action: "reveal" })}>Reveal now · {Math.ceil(remaining ?? 0)}s</button>{/if}
        {#if phase === "reveal"}<button type="button" class="btn btn-signal btn-block" onclick={() => send("quiz", { slideId: slide.id, action: "leaderboard" })}>Show leaderboard</button>{/if}
      {:else if slide.type !== "content"}
        {#if slide.type !== "qna"}
          <button type="button" class="btn btn-ghost" onclick={() => send("update", { slideId: slide.id, resultsHidden: !view!.state.resultsHidden })}>
            <Icon name={view.state.resultsHidden ? "eye" : "eye-off"} size={18} /> {view.state.resultsHidden ? "Show results" : "Hide results"}
          </button>
        {/if}
        <button type="button" class="btn btn-ghost" onclick={() => send("update", { slideId: slide.id, locked: !view!.state.locked })}>
          <Icon name={view.state.locked ? "unlock" : "lock"} size={18} /> {view.state.locked ? "Open answers" : "Close answers"}
        </button>
      {/if}
    </div>

    {#if slide.type === "qna"}
      <section class="panel">
        <h2>Questions · {questions.length}</h2>
        {#if !questions.length}<p class="quiet">No questions yet.</p>{/if}
        <ul>
          {#each questions as q (q.id)}
            <li class:answered={q.status === "answered"}>
              <p><strong>{q.text}</strong></p>
              <p class="quiet">{q.name ?? "Anonymous"} · {plural(q.upvotes, "upvote")}{q.status === "pending" ? " · waiting" : ""}</p>
              <div class="row">
                {#if q.status === "pending"}<button class="btn btn-small btn-signal" type="button" onclick={() => send("moderate", { questionId: q.id, status: "live" })}>Show</button>{/if}
                {#if q.status === "live"}<button class="btn btn-small" type="button" onclick={() => send("moderate", { questionId: q.id, status: "answered" })}>Answered</button>{/if}
                <button class="btn btn-small btn-ghost" type="button" onclick={() => send("moderate", { questionId: q.id, status: "hidden" })}>Hide</button>
              </div>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="panel">
      <h2>All slides</h2>
      <ol class="slides">
        {#each slides as s, i (s.id)}
          <li>
            <button type="button" class:current={i === view.slideIndex} onclick={() => send("go", { index: i })}>
              <span class="n">{i + 1}</span>
              <span class="t"><small>{SLIDE_TYPE_LABELS[s.type]}</small>{slideTitle(s) || "Untitled"}</span>
            </button>
          </li>
        {/each}
      </ol>
    </section>
  {/if}
</main>

<style>
  .remote {
    min-height: 100dvh;
    max-width: 560px;
    margin: 0 auto;
    padding: 16px 16px 48px;
  }

  .centre {
    display: grid;
    justify-items: center;
    gap: 12px;
    padding-top: 30vh;
    text-align: center;
  }

  .centre h1 {
    font-size: 1.6rem;
  }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .head h1 {
    margin-top: 4px;
    font-size: 1.4rem;
  }

  .people {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--paper-2);
    font-weight: 700;
  }

  .banner {
    margin-top: 10px;
    padding: 8px 12px;
    border-radius: 10px;
    background: var(--sun);
    font-weight: 600;
  }

  .screen {
    aspect-ratio: 16 / 9;
    margin-top: 16px;
    border-radius: 14px;
    overflow: hidden;
    box-shadow: var(--shadow-2);
  }

  .nav {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 12px;
    margin-top: 16px;
  }

  .big {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 72px;
    border: 0;
    border-radius: 20px;
    background: var(--paper-2);
    color: var(--ink);
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
  }

  .big.next {
    background: var(--ink);
    color: var(--paper);
  }

  .big:disabled {
    opacity: 0.35;
  }

  .pos {
    font-family: var(--font-display);
    font-size: 1.8rem;
    font-weight: 700;
    text-align: center;
  }

  .pos small {
    margin-left: 4px;
    font-size: 1rem;
    color: var(--ink-3);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 14px;
  }

  .actions .btn:not(.btn-block) {
    flex: 1;
  }

  .panel {
    margin-top: 22px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: 16px;
    background: var(--card);
  }

  .panel h2 {
    font-size: 1.1rem;
    margin-bottom: 10px;
  }

  .panel ul,
  .slides {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .panel li.answered {
    opacity: 0.6;
  }

  .panel li + li {
    padding-top: 8px;
    border-top: 1px solid var(--line);
  }

  .quiet {
    font-size: 0.85rem;
    color: var(--ink-3);
  }

  .row {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }

  .slides button {
    display: grid;
    grid-template-columns: 28px 1fr;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 52px;
    padding: 6px 10px;
    border: 1.5px solid transparent;
    border-radius: 12px;
    background: var(--paper);
    text-align: left;
    cursor: pointer;
  }

  .slides button.current {
    border-color: var(--signal);
    background: var(--signal-soft);
  }

  .slides .n {
    font-weight: 700;
    color: var(--ink-3);
  }

  .slides .t {
    display: grid;
    overflow: hidden;
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .slides small {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
</style>
