<script lang="ts">
  import { page } from "$app/state";
  import { onMount } from "svelte";

  import {
    formatJoinCode,
    type HostSnapshot,
    type LeaderboardEntry,
    type LiveView,
    type Question,
    type Results,
    type Slide,
  } from "@roomwave/shared";
  import { Mark, SlideView, THEMES_BY_ID } from "@roomwave/ui";

  import Dialog from "#lib/components/Dialog.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import QrCode from "#lib/components/QrCode.svelte";
  import { plural } from "#lib/format.ts";
  import { slideImageUrl } from "#lib/images.ts";
  import { hostSocket, ServerClock, type HostSocket } from "#lib/live.ts";
  import { toasts } from "#lib/toast.svelte.ts";

  const sessionId = $derived(page.params.sessionId!);

  let socket: HostSocket | null = null;
  const clock = new ServerClock();

  let view = $state<LiveView | null>(null);
  let slides = $state<Slide[]>([]);
  let results = $state<Record<string, Results>>({});
  let boards = $state<Record<string, LeaderboardEntry[]>>({});
  let participants = $state(0);
  let remoteToken = $state<string | null>(null);
  let connected = $state(false);
  let problem = $state("");
  let ended = $state(false);
  let now = $state(Date.now());

  let showJoin = $state(false);
  let showRemote = $state(false);
  let showQuestions = $state(false);
  let confirmEnd = $state(false);
  let confirmReset = $state(false);
  let controlsVisible = $state(true);
  let fullscreen = $state(false);
  let fullAt = $state<number | null>(null);

  const theme = $derived(view ? THEMES_BY_ID[view.theme] : THEMES_BY_ID.ink);
  const slide = $derived(view?.slide ?? null);
  const slideResults = $derived(slide ? (results[slide.id] ?? null) : null);
  const remaining = $derived(
    view?.state.quiz?.phase === "open" && view.state.quiz.endsAt ? Math.max(0, (view.state.quiz.endsAt - now) / 1000) : null,
  );
  const questions = $derived<Question[]>(slideResults?.type === "qna" ? slideResults.questions : []);
  const pending = $derived(questions.filter((q) => q.status === "pending"));
  const joinUrl = $derived(view ? `${location.origin}/${view.code}` : "");
  const host = typeof location !== "undefined" ? location.host : "";

  function attach() {
    socket?.emit("attach", { sessionId }, (reply) => {
      if (!reply.ok) {
        problem =
          reply.error === "signed_out"
            ? "Please sign in again to present."
            : reply.error === "forbidden"
              ? "This session belongs to another account."
              : "This session could not be found.";
        return;
      }
      const snap: HostSnapshot = reply.snapshot;
      clock.sync(snap.view.serverNow);
      view = snap.view;
      slides = snap.slides;
      results = snap.results;
      participants = snap.participants;
      remoteToken = snap.remoteToken;
      ended = snap.view.ended;
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
    socket.on("results", (slideId, next) => (results = { ...results, [slideId]: next }));
    socket.on("participants", (count) => (participants = count));
    socket.on("leaderboard", (slideId, entries) => (boards = { ...boards, [slideId]: entries }));
    socket.on("ended", () => (ended = true));
    socket.on("full", (limit) => (fullAt = limit));

    const tick = setInterval(() => (now = clock.now()), 250);
    const onFullscreen = () => (fullscreen = Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      clearInterval(tick);
      document.removeEventListener("fullscreenchange", onFullscreen);
      socket?.disconnect();
    };
  });

  // When the buzzer goes, reveal: the server does the same, whichever comes first.
  let revealedFor = "";
  $effect(() => {
    if (remaining === 0 && slide && view?.state.quiz?.phase === "open" && revealedFor !== slide.id) {
      revealedFor = slide.id;
      send("quiz", { slideId: slide.id, action: "reveal" });
    }
  });

  function send<E extends "go" | "update" | "quiz" | "reset" | "moderate" | "end">(
    event: E,
    payload: Record<string, unknown>,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (!socket?.connected) {
        toasts.show("Reconnecting… try again in a moment.", "info");
        return resolve(false);
      }
      (socket.emit as (e: string, p: unknown, ack: (r: { ok: boolean; error?: string }) => void) => void)(event, payload, (reply) => {
        if (!reply.ok) toasts.show("That did not work. Try again.", "error");
        resolve(reply.ok);
      });
    });
  }

  const go = (delta: number) => view && send("go", { index: view.slideIndex + delta });

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }

  async function endSession() {
    confirmEnd = false;
    if (await send("end", {})) ended = true;
  }

  async function resetSlide() {
    confirmReset = false;
    if (slide && (await send("reset", { slideId: slide.id }))) toasts.show("Answers cleared for this slide.");
  }

  // Controls fade away while the mouse is still, so the screen is clean for the room.
  let idle: ReturnType<typeof setTimeout> | null = null;
  function wake() {
    controlsVisible = true;
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => (controlsVisible = false), 3000);
  }

  function onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, dialog")) return;
    if (!slide) return;
    switch (event.key) {
      case "ArrowRight":
      case "PageDown":
      case " ":
        event.preventDefault();
        go(1);
        break;
      case "ArrowLeft":
      case "PageUp":
        event.preventDefault();
        go(-1);
        break;
      case "h":
      case "H":
        send("update", { slideId: slide.id, resultsHidden: !view!.state.resultsHidden });
        break;
      case "l":
      case "L":
        send("update", { slideId: slide.id, locked: !view!.state.locked });
        break;
      case "q":
      case "Q":
        showJoin = !showJoin;
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      case "Escape":
        showJoin = false;
        showRemote = false;
        showQuestions = false;
        break;
    }
    wake();
  }
</script>

<svelte:head>
  <title>{view ? `${view.title} · Presenting` : "Presenting"} · Roomwave</title>
</svelte:head>

<svelte:window onkeydown={onKey} onpointermove={wake} />

<main id="main" class="presenter" class:hide-cursor={!controlsVisible && !showQuestions}>
  {#if problem}
    <div class="center-message">
      <h1>{problem}</h1>
      <a class="btn btn-signal" href={problem.startsWith("Please sign in") ? `/signin?next=/present/${sessionId}` : "/app"}>
        {problem.startsWith("Please sign in") ? "Sign in" : "Back to your presentations"}
      </a>
    </div>
  {:else if ended}
    <div class="center-message">
      <Mark size={48} />
      <h1>The session has ended</h1>
      <p>{plural(participants, "person", "people")} still connected have been told. Every answer is saved.</p>
      <div class="end-actions">
        <a class="btn btn-signal" href={view ? `/app` : "/app"}>Back to your presentations</a>
      </div>
    </div>
  {:else if !view || !slide}
    <div class="center-message"><Mark size={48} live title="Connecting" /><p>Connecting…</p></div>
  {:else}
    <div class="canvas" style={`--t-bg:${theme.background}`}>
      <div class="joinbar" style={`background:${theme.surface};color:${theme.text};border-color:${theme.line}`}>
        <span>Join at <strong>{host}</strong></span>
        <span class="code-label">and use the code</span>
        <strong class="code" style={`color:${theme.accent}`}>{formatJoinCode(view.code)}</strong>
        <button type="button" class="mini-qr" aria-label="Show the join code full screen" onclick={() => (showJoin = true)}>
          <QrCode value={joinUrl} label={`QR code to join with code ${view.code}`} color={theme.text} background={theme.surface} />
        </button>
      </div>
      <div class="slide">
        <SlideView
          slide={slide}
          results={slideResults}
          state={view.state}
          {theme}
          {remaining}
          leaderboard={boards[slide.id] ?? []}
          imageUrl={slideImageUrl}
        />
      </div>
    </div>

    {#if !connected}
      <p class="reconnecting" role="status"><span class="spinner" aria-hidden="true"></span> Reconnecting…</p>
    {/if}

    {#if fullAt !== null}
      <div class="full-notice" role="alert">
        <p><strong>This session is full.</strong> It holds {fullAt.toLocaleString("en-KE")} people on your plan, and more are trying to join.</p>
        <a class="btn btn-small btn-signal" href="/app/billing" target="_blank" rel="noopener">See bigger plans</a>
        <button type="button" class="ctl" aria-label="Dismiss" onclick={() => (fullAt = null)}><Icon name="x" size={18} /></button>
      </div>
    {/if}

    <nav class="controls" class:visible={controlsVisible || showQuestions} aria-label="Presenter controls">
      <div class="group">
        <button type="button" class="ctl" aria-label="Previous slide" disabled={view.slideIndex === 0} onclick={() => go(-1)}><Icon name="chevron-left" /></button>
        <span class="position">{view.slideIndex + 1} / {view.slideCount}</span>
        <button type="button" class="ctl" aria-label="Next slide" disabled={view.slideIndex >= view.slideCount - 1} onclick={() => go(1)}><Icon name="chevron-right" /></button>
      </div>

      <div class="group">
        {#if slide.type === "quiz"}
          {@const phase = view.state.quiz?.phase ?? "ready"}
          {#if phase === "ready"}
            <button type="button" class="ctl wide primary" onclick={() => send("quiz", { slideId: slide.id, action: "start" })}><Icon name="play" filled size={18} /> Start the timer</button>
          {:else if phase === "open"}
            <button type="button" class="ctl wide primary" onclick={() => send("quiz", { slideId: slide.id, action: "reveal" })}><Icon name="eye" size={18} /> Reveal now</button>
          {:else if phase === "reveal"}
            <button type="button" class="ctl wide primary" onclick={() => send("quiz", { slideId: slide.id, action: "leaderboard" })}><Icon name="chart" size={18} /> Show leaderboard</button>
          {/if}
          {#if phase !== "ready"}
            <button type="button" class="ctl wide" onclick={() => (confirmReset = true)}><Icon name="refresh" size={18} /> Run again</button>
          {/if}
        {:else if slide.type !== "content"}
          {#if slide.type !== "qna"}
            <button type="button" class="ctl wide" aria-pressed={view.state.resultsHidden} title="Hide or show results (H)" onclick={() => send("update", { slideId: slide.id, resultsHidden: !view!.state.resultsHidden })}>
              <Icon name={view.state.resultsHidden ? "eye" : "eye-off"} size={18} /> {view.state.resultsHidden ? "Show results" : "Hide results"}
            </button>
          {:else}
            <button type="button" class="ctl wide" aria-expanded={showQuestions} onclick={() => (showQuestions = !showQuestions)}>
              <Icon name="inbox" size={18} /> Questions{#if pending.length}<span class="pill">{pending.length} waiting</span>{/if}
            </button>
          {/if}
          <button type="button" class="ctl wide" aria-pressed={view.state.locked} title="Close or open answers (L)" onclick={() => send("update", { slideId: slide.id, locked: !view!.state.locked })}>
            <Icon name={view.state.locked ? "unlock" : "lock"} size={18} /> {view.state.locked ? "Open answers" : "Close answers"}
          </button>
          <button type="button" class="ctl" aria-label="Clear the answers on this slide" title="Clear answers" onclick={() => (confirmReset = true)}><Icon name="refresh" size={18} /></button>
        {/if}
      </div>

      <div class="group">
        <span class="people" title="People connected"><Icon name="users" size={18} /> {participants}</span>
        <button type="button" class="ctl" aria-label="Show the join code full screen (Q)" title="Join code (Q)" onclick={() => (showJoin = true)}><Icon name="qr" size={18} /></button>
        {#if remoteToken}
          <button type="button" class="ctl" aria-label="Control from your phone" title="Phone remote" onclick={() => (showRemote = true)}><Icon name="phone" size={18} /></button>
        {/if}
        <button type="button" class="ctl" aria-label={fullscreen ? "Leave full screen" : "Full screen"} title="Full screen (F)" onclick={toggleFullscreen}><Icon name={fullscreen ? "shrink" : "expand"} size={18} /></button>
        <button type="button" class="ctl danger" onclick={() => (confirmEnd = true)}><Icon name="stop" size={16} filled /> End</button>
      </div>
    </nav>

    {#if showQuestions && slide.type === "qna"}
      <aside class="moderation" aria-label="Moderate questions">
        <header>
          <h2>Questions</h2>
          <button type="button" class="ctl" aria-label="Close" onclick={() => (showQuestions = false)}><Icon name="x" size={18} /></button>
        </header>
        {#if !questions.length}
          <p class="quiet">No questions yet.</p>
        {/if}
        {#each [{ status: "pending", title: "Waiting for you" }, { status: "live", title: "On screen" }, { status: "answered", title: "Answered" }] as group (group.status)}
          {@const list = questions.filter((q) => q.status === group.status)}
          {#if list.length}
            <h3>{group.title} · {list.length}</h3>
            <ul>
              {#each list as q (q.id)}
                <li>
                  <p class="q-text">{q.text}</p>
                  <p class="q-meta">{q.name ?? "Anonymous"} · {plural(q.upvotes, "upvote")}</p>
                  <div class="q-actions">
                    {#if q.status === "pending"}
                      <button type="button" class="btn btn-small btn-signal" onclick={() => send("moderate", { questionId: q.id, status: "live" })}>Show</button>
                    {:else if q.status === "live"}
                      <button type="button" class="btn btn-small" onclick={() => send("moderate", { questionId: q.id, status: "answered" })}>Answered</button>
                    {:else}
                      <button type="button" class="btn btn-small btn-ghost" onclick={() => send("moderate", { questionId: q.id, status: "live" })}>Back on screen</button>
                    {/if}
                    <button type="button" class="btn btn-small btn-ghost" onclick={() => send("moderate", { questionId: q.id, status: "hidden" })}>Hide</button>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        {/each}
      </aside>
    {/if}

    {#if showJoin}
      <div class="join-overlay" style={`background:${theme.background};color:${theme.text}`} role="dialog" aria-modal="true" aria-label="How to join">
        <div class="join-glow" style={`background:${theme.glow}`}></div>
        <div class="join-content">
          <div class="join-steps">
            <p class="eyebrow" style={`color:${theme.accent}`}>Join on your phone</p>
            <p class="join-line">Go to <strong>{host}</strong></p>
            <p class="join-line">and enter the code</p>
            <p class="join-code" style={`color:${theme.accent}`}>{formatJoinCode(view.code)}</p>
            <p class="join-or" style={`color:${theme.muted}`}>or scan the code with your camera</p>
          </div>
          <div class="join-qr">
            <QrCode value={joinUrl} label={`QR code to join with code ${view.code}`} color="#1d1430" background="#ffffff" />
          </div>
        </div>
        <button type="button" class="btn join-close" onclick={() => (showJoin = false)}><Icon name="x" size={18} /> Back to the slide</button>
      </div>
    {/if}
  {/if}
</main>

<Dialog bind:open={showRemote} title="Control from your phone" description="Scan this with your phone to move between slides, start quizzes and see questions from anywhere in the room.">
  {#if remoteToken}
    <div class="remote-qr">
      <QrCode value={`${location.origin}/remote/${remoteToken}`} label="QR code for the phone remote" />
    </div>
    <p class="hint">Keep this code to yourself: anyone who scans it can move your slides.</p>
  {/if}
</Dialog>

<Dialog bind:open={confirmEnd} title="End the session?" description="Phones will see that the session has ended, and the code stops working. Every answer is kept in your results.">
  {#snippet actions()}
    <button type="button" class="btn btn-ghost" onclick={() => (confirmEnd = false)}>Keep going</button>
    <button type="button" class="btn btn-danger" onclick={endSession}>End the session</button>
  {/snippet}
  <span></span>
</Dialog>

<Dialog bind:open={confirmReset} title="Clear the answers on this slide?" description="Everything given on this slide during this session is removed, and people can answer again.">
  {#snippet actions()}
    <button type="button" class="btn btn-ghost" onclick={() => (confirmReset = false)}>Keep them</button>
    <button type="button" class="btn btn-danger" onclick={resetSlide}>Clear answers</button>
  {/snippet}
  <span></span>
</Dialog>

<style>
  .presenter {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    background: #0b0712;
    color: var(--stage-text);
    overflow: hidden;
  }

  .hide-cursor {
    cursor: none;
  }

  .canvas {
    display: grid;
    grid-template-rows: auto 1fr;
    width: min(100vw, calc(100dvh * 16 / 9));
    aspect-ratio: 16 / 9;
    background: var(--t-bg);
    container-type: inline-size;
  }

  .joinbar {
    display: flex;
    align-items: center;
    gap: 0.7cqw;
    padding: 0.7cqw 1.4cqw 0.7cqw 2.2cqw;
    border-bottom: 1px solid;
    font-size: 1.35cqw;
  }

  .code-label {
    opacity: 0.75;
  }

  .code {
    font-family: var(--font-display);
    font-size: 1.9cqw;
    letter-spacing: 0.04em;
  }

  .mini-qr {
    width: 3.4cqw;
    margin-left: auto;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }

  .slide {
    min-height: 0;
  }

  .center-message {
    display: grid;
    justify-items: center;
    gap: 14px;
    max-width: 520px;
    padding: 24px;
    text-align: center;
  }

  .center-message h1 {
    font-size: var(--step-3);
  }

  .center-message p {
    color: var(--stage-muted);
  }

  .end-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-top: 8px;
  }

  .reconnecting {
    position: fixed;
    top: 16px;
    left: 50%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    border-radius: 999px;
    background: var(--sun);
    color: var(--ink);
    font-weight: 600;
    transform: translateX(-50%);
  }

  .full-notice {
    position: fixed;
    top: 16px;
    left: 0;
    right: 0;
    z-index: 26;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 14px;
    width: max-content;
    max-width: calc(100vw - 24px);
    margin: 0 auto;
    padding: 10px 10px 10px 18px;
    border-radius: 14px;
    background: var(--paper);
    color: var(--ink);
    box-shadow: var(--shadow-3);
  }

  .full-notice p {
    max-width: 52ch;
  }

  .full-notice .ctl {
    color: var(--ink);
  }

  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .controls {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 16px;
    width: max-content;
    margin: 0 auto;
    z-index: 20;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 8px;
    max-width: calc(100vw - 24px);
    padding: 6px;
    border: 1px solid rgb(255 255 255 / 0.1);
    border-radius: 18px;
    background: rgb(22 15 36 / 0.92);
    backdrop-filter: blur(10px);
    box-shadow: 0 20px 50px -10px rgb(0 0 0 / 0.6);
    transform: translateY(140%);
    opacity: 0;
    transition:
      transform 300ms var(--ease-out),
      opacity 300ms ease;
  }

  .controls.visible,
  .controls:focus-within,
  .controls:hover {
    transform: translateY(0);
    opacity: 1;
  }

  .group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .group + .group {
    padding-left: 8px;
    border-left: 1px solid rgb(255 255 255 / 0.12);
  }

  .ctl {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 40px;
    height: 40px;
    padding: 0 10px;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--stage-text);
    font-size: 0.92rem;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }

  .ctl:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.1);
  }

  .ctl:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .ctl[aria-pressed="true"] {
    background: rgb(255 255 255 / 0.14);
  }

  .ctl.primary {
    background: var(--signal);
    color: var(--ink);
  }

  .ctl.primary:hover {
    background: #ff7c45;
  }

  .ctl.danger {
    color: #ffb4a8;
  }

  .pill {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--sun);
    color: var(--ink);
    font-size: 0.78rem;
  }

  .position,
  .people {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    font-size: 0.92rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--stage-muted);
  }

  .moderation {
    position: fixed;
    top: 12px;
    right: 12px;
    bottom: 84px;
    z-index: 25;
    width: min(380px, calc(100vw - 24px));
    padding: 16px;
    border-radius: 18px;
    background: var(--paper);
    color: var(--ink);
    box-shadow: var(--shadow-3);
    overflow-y: auto;
  }

  .moderation header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .moderation header .ctl {
    color: var(--ink);
  }

  .moderation h2 {
    font-size: 1.4rem;
  }

  .moderation h3 {
    margin: 18px 0 8px;
    font-family: var(--font-text);
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .moderation ul {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .moderation li {
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: var(--card);
  }

  .q-text {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .q-meta,
  .quiet {
    margin-top: 4px;
    font-size: 0.85rem;
    color: var(--ink-3);
  }

  .q-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 10px;
  }

  .join-overlay {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    padding: 4vw;
    isolation: isolate;
  }

  .join-glow {
    position: absolute;
    inset: 0;
    z-index: -1;
  }

  .join-content {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 6vw;
    width: min(1300px, 100%);
  }

  .join-line {
    font-family: var(--font-display);
    font-size: clamp(1.6rem, 3.6vw, 4rem);
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.02em;
  }

  .join-code {
    margin-top: 1vw;
    font-family: var(--font-display);
    font-size: clamp(3.5rem, 11vw, 12rem);
    font-weight: 800;
    line-height: 1;
    letter-spacing: 0.02em;
    font-variant-numeric: tabular-nums;
  }

  .join-or {
    margin-top: 1.5vw;
    font-size: clamp(1rem, 1.6vw, 1.6rem);
  }

  .join-qr {
    width: min(32vw, 60vh);
    padding: 1.4vw;
    border-radius: 3vw;
    background: #fff;
  }

  .join-close {
    position: fixed;
    top: 16px;
    right: 16px;
  }

  .remote-qr {
    width: min(280px, 100%);
    margin: 0 auto 12px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 760px) {
    .join-content {
      grid-template-columns: 1fr;
      justify-items: center;
      text-align: center;
    }

    .join-qr {
      width: min(60vw, 40vh);
    }

    .controls {
      bottom: 8px;
      border-radius: 14px;
    }

    .group + .group {
      padding-left: 0;
      border-left: 0;
    }
  }
</style>
