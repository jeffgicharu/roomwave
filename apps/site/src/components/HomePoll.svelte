<script lang="ts">
  import { onMount } from "svelte";
  import { io, type Socket } from "socket.io-client";

  import { NAMESPACES, SOCKET_PATH, type HomeClientEvents, type HomePoll, type HomeServerEvents } from "@roomwave/shared";

  let poll = $state<HomePoll | null>(null);
  let mine = $state<string | null>(null);
  let status = $state<"loading" | "ready" | "offline">("loading");
  let sending = $state(false);
  let socket: Socket<HomeServerEvents, HomeClientEvents> | null = null;
  let token = "";

  function readToken(): string {
    try {
      const saved = localStorage.getItem("rw:home");
      if (saved && /^[A-Za-z0-9_-]{20,64}$/.test(saved)) return saved;
      const fresh = Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
      localStorage.setItem("rw:home", fresh);
      return fresh;
    } catch {
      return Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
    }
  }

  onMount(() => {
    token = readToken();
    socket = io(NAMESPACES.home, { path: SOCKET_PATH, transports: ["websocket", "polling"], tryAllTransports: true });
    socket.on("connect", () => {
      socket?.emit("hello", { token }, (reply) => {
        poll = reply.poll;
        mine = reply.mine;
        status = reply.poll ? "ready" : "offline";
      });
    });
    socket.on("connect_error", () => {
      if (!poll) status = "offline";
    });
    socket.on("poll", (next) => {
      if (poll && next.id !== poll.id) mine = null;
      poll = next;
      status = "ready";
    });
    return () => socket?.disconnect();
  });

  function vote(optionId: string) {
    if (!socket || !poll || sending) return;
    sending = true;
    const previous = mine;
    mine = optionId;
    socket.timeout(6000).emit("vote", { pollId: poll.id, optionId, token }, (error, reply) => {
      sending = false;
      if (error || !reply?.ok) mine = previous;
    });
  }

  function share(id: string): number {
    if (!poll?.total) return 0;
    return Math.round(((poll.counts[id] ?? 0) / poll.total) * 100);
  }

  const most = $derived(poll ? Math.max(1, ...poll.options.map((o) => poll!.counts[o.id] ?? 0)) : 1);
  const colours = ["#e96626", "#0eaa9d", "#8f80f2", "#ba8c00"];
</script>

<div class="poll" aria-live="polite">
  <div class="top">
    <span class="live"><span class="dot" aria-hidden="true"></span>Live poll</span>
    {#if poll}<span class="count">{poll.total.toLocaleString("en-KE")} {poll.total === 1 ? "vote" : "votes"} so far</span>{/if}
  </div>

  {#if status === "loading"}
    <p class="question placeholder" aria-busy="true">Fetching today's question…</p>
    <div class="skeleton" aria-hidden="true">{#each [1, 2, 3, 4] as n (n)}<span></span>{/each}</div>
  {:else if status === "offline" || !poll}
    <p class="question">The live poll is resting.</p>
    <p class="note">Try it yourself instead: start a sample presentation and answer from your phone.</p>
  {:else}
    <p class="question">{poll.question}</p>
    <ul class="options">
      {#each poll.options as option, i (option.id)}
        <li>
          <button
            type="button"
            class:mine={mine === option.id}
            aria-pressed={mine === option.id}
            disabled={sending}
            style={`--share:${(poll.counts[option.id] ?? 0) / most};--any:${poll.counts[option.id] ? 1 : 0};--c:${colours[i % colours.length]}`}
            onclick={() => vote(option.id)}
          >
            <span class="fill" aria-hidden="true"></span>
            <span class="label">{option.label}</span>
            <span class="pct">{share(option.id)}%</span>
          </button>
        </li>
      {/each}
    </ul>
    <!-- Both lines share one cell, so the box is as tall as the longer one and nothing below it moves after a vote. -->
    <p class="note">
      <span class:shown={!mine}>Tap an answer. You'll see it land, along with everyone else's.</span>
      <span class:shown={Boolean(mine)}>Your vote is in, and you are watching everyone else's arrive. Tap another answer to change it.</span>
    </p>
  {/if}
</div>

<style>
  .poll {
    position: relative;
    display: grid;
    gap: 18px;
    padding: clamp(22px, 3vw, 32px);
    border-radius: 26px;
    background: var(--stage);
    background-image: radial-gradient(80% 60% at 100% 0%, rgb(255 122 61 / 0.3), transparent 60%), radial-gradient(60% 50% at 0% 100%, rgb(107 92 255 / 0.22), transparent 70%);
    color: var(--stage-text);
    box-shadow: 0 40px 80px -30px rgb(29 20 48 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.06) inset;
  }

  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 0.85rem;
  }

  .live {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    border-radius: 999px;
    background: var(--signal);
    color: var(--ink);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    font-size: 0.75rem;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    animation: rw-pulse 1.4s ease-in-out infinite;
  }

  .count {
    color: var(--stage-muted);
    font-variant-numeric: tabular-nums;
  }

  .question {
    font-family: var(--font-display);
    font-size: clamp(1.4rem, 1.1rem + 1.2vw, 2rem);
    font-weight: 700;
    line-height: 1.08;
    letter-spacing: -0.025em;
  }

  .placeholder {
    color: var(--stage-muted);
  }

  .options {
    display: grid;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  button {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    min-height: 54px;
    padding: 12px 16px;
    border: 1.5px solid var(--stage-line);
    border-radius: 14px;
    background: var(--stage-2);
    color: var(--stage-text);
    font-size: 1rem;
    font-weight: 600;
    text-align: left;
    overflow: hidden;
    isolation: isolate;
    cursor: pointer;
    transition: border-color 150ms ease, transform 120ms ease;
  }

  button:hover {
    border-color: var(--stage-muted);
  }

  button:active {
    transform: scale(0.99);
  }

  button.mine {
    border-color: var(--c);
  }

  .fill {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--c);
    opacity: 0.32;
    transform-origin: 0 50%;
    transform: scaleX(max(var(--share), calc(0.01 * var(--any))));
    transition: transform 800ms var(--ease-spring);
  }

  .mine .fill {
    opacity: 0.55;
  }

  .label {
    overflow-wrap: anywhere;
  }

  .pct {
    font-family: var(--font-display);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .note {
    display: grid;
    font-size: 0.9rem;
    color: var(--stage-muted);
  }

  .note span {
    grid-area: 1 / 1;
    visibility: hidden;
  }

  .note span.shown {
    visibility: visible;
  }

  .skeleton {
    display: grid;
    gap: 10px;
  }

  .skeleton span {
    height: 54px;
    border-radius: 14px;
    background: linear-gradient(90deg, var(--stage-2), var(--stage-3), var(--stage-2));
    background-size: 200% 100%;
    animation: shimmer 1.4s linear infinite;
  }

  @keyframes shimmer {
    to {
      background-position: -200% 0;
    }
  }
</style>
