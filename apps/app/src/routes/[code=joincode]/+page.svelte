<script lang="ts">
  import { page } from "$app/state";
  import { onMount } from "svelte";

  import {
    LIMITS,
    type Answer,
    type JoinError,
    type LeaderboardEntry,
    type LiveView,
    type Mine,
    type Question,
    type QuizPersonalResult,
    type Results,
    type Slide,
  } from "@roomwave/shared";
  import { THEMES_BY_ID, themeStyle } from "@roomwave/ui/themes";

  import { respondMessage } from "#lib/audience/messages.ts";
  import MiniResults from "#lib/audience/MiniResults.svelte";
  import { audienceSocket, ServerClock, type AudienceSocket } from "#lib/live.ts";

  const code = $derived(page.params.code!);
  const tokenKey = $derived(`rw:p:${code}`);

  let socket: AudienceSocket | null = null;
  const clock = new ServerClock();

  let status = $state<"joining" | "live" | "error">("joining");
  let joinError = $state<JoinError | null>(null);
  let connected = $state(true);
  let view = $state<LiveView | null>(null);
  let name = $state<string | null>(null);
  let participantId = $state<string | null>(null);
  let mine = $state<Record<string, Mine>>({});
  let results = $state<Record<string, Results>>({});
  let quizResults = $state<Record<string, QuizPersonalResult>>({});
  let boards = $state<Record<string, LeaderboardEntry[]>>({});
  let ended = $state(false);
  let now = $state(Date.now());

  let busy = $state(false);
  let notice = $state("");
  let pollChoice = $state<string[]>([]);
  let word = $state("");
  let question = $state("");
  let askName = $state("");
  let editingName = $state(false);
  let nameDraft = $state("");

  const slide = $derived((view?.slide ?? null) as Slide | null);
  const theme = $derived(THEMES_BY_ID[view?.theme ?? "paper"]);
  const myAnswer = $derived(slide ? mine[slide.id] : undefined);
  const slideResults = $derived(slide ? (results[slide.id] ?? null) : null);
  const remaining = $derived(
    view?.state.quiz?.phase === "open" && view.state.quiz.endsAt ? Math.max(0, (view.state.quiz.endsAt - now) / 1000) : null,
  );
  const quizLimit = $derived(slide?.type === "quiz" ? slide.config.timeLimit : 1);

  function readToken(): string | null {
    try {
      return localStorage.getItem(tokenKey);
    } catch {
      return null;
    }
  }

  function saveToken(token: string) {
    try {
      localStorage.setItem(tokenKey, token);
    } catch {
      // Private browsing: the phone simply joins as someone new after a reload.
    }
  }

  function join() {
    socket?.emit("join", { code, token: readToken() }, (reply) => {
      if (!reply.ok) {
        status = "error";
        joinError = reply.error;
        if (reply.error === "busy") setTimeout(join, 2000);
        return;
      }
      saveToken(reply.token);
      participantId = reply.participantId;
      name = reply.name;
      clock.sync(reply.view.serverNow);
      view = reply.view;
      ended = reply.view.ended;
      mine = { ...mine, [reply.view.slide.id]: reply.mine };
      if (reply.results) results = { ...results, [reply.view.slide.id]: reply.results };
      status = "live";
    });
  }

  onMount(() => {
    socket = audienceSocket();
    socket.on("connect", () => {
      connected = true;
      join();
    });
    socket.on("disconnect", () => (connected = false));
    socket.on("view", (next) => {
      clock.sync(next.serverNow);
      if (view?.slide.id !== next.slide.id) {
        notice = "";
        pollChoice = [];
        word = "";
      }
      view = next;
    });
    socket.on("results", (slideId, next) => (results = { ...results, [slideId]: next }));
    socket.on("cleared", (slideId) => {
      const { [slideId]: _gone, ...rest } = mine;
      mine = rest;
      const { [slideId]: _r, ...restResults } = quizResults;
      quizResults = restResults;
      pollChoice = [];
    });
    socket.on("quizResult", (result) => (quizResults = { ...quizResults, [result.slideId]: result }));
    socket.on("leaderboard", (slideId, entries) => (boards = { ...boards, [slideId]: entries }));
    socket.on("ended", () => (ended = true));
    const tick = setInterval(() => (now = clock.now()), 200);
    return () => {
      clearInterval(tick);
      socket?.disconnect();
    };
  });

  function respond(answer: Answer): Promise<boolean> {
    return new Promise((resolve) => {
      if (!socket || !slide) return resolve(false);
      busy = true;
      notice = "";
      const slideId = slide.id;
      socket.timeout(8000).emit("respond", { slideId, answer }, (error, reply) => {
        busy = false;
        if (error || !reply) {
          notice = "Your answer did not go through. Check your connection and try again.";
          return resolve(false);
        }
        if (!reply.ok) {
          notice = respondMessage(reply.error);
          return resolve(false);
        }
        mine = { ...mine, [slideId]: reply.mine };
        resolve(true);
      });
    });
  }

  async function sendWord(event: SubmitEvent) {
    event.preventDefault();
    if (!word.trim()) return;
    if (await respond({ type: "wordcloud", text: word })) word = "";
  }

  async function ask(event: SubmitEvent) {
    event.preventDefault();
    if (!socket || !slide || slide.type !== "qna" || question.trim().length < 2) return;
    busy = true;
    notice = "";
    const slideId = slide.id;
    socket.timeout(8000).emit("ask", { slideId, text: question, name: askName.trim() || null }, (error, reply) => {
      busy = false;
      if (error || !reply) return void (notice = "Your question did not go through. Try again.");
      if (!reply.ok) return void (notice = respondMessage(reply.error));
      const before = mine[slideId];
      const asked = before?.type === "qna" ? before.asked : [];
      const upvoted = before?.type === "qna" ? before.upvoted : [];
      mine = { ...mine, [slideId]: { type: "qna", asked: [...asked, reply.question], upvoted } };
      question = "";
      notice = reply.question.status === "pending" ? "Sent. It appears once the presenter approves it." : "Sent.";
    });
  }

  function upvote(questionId: string) {
    if (!socket || !slide) return;
    const before = mine[slide.id];
    const upvoted = before?.type === "qna" ? before.upvoted : [];
    const on = !upvoted.includes(questionId);
    const asked = before?.type === "qna" ? before.asked : [];
    const slideId = slide.id;
    // Shown at once; the count catches up when the room's results arrive.
    mine = { ...mine, [slideId]: { type: "qna", asked, upvoted: on ? [...upvoted, questionId] : upvoted.filter((id) => id !== questionId) } };
    socket.emit("upvote", { questionId, on }, (reply) => {
      if (!reply.ok) mine = { ...mine, [slideId]: { type: "qna", asked, upvoted } };
    });
  }

  function saveName(event: SubmitEvent) {
    event.preventDefault();
    const next = nameDraft.trim();
    if (!next || !socket) return;
    socket.emit("setName", { name: next }, (reply) => {
      if (reply.ok) {
        name = next.slice(0, LIMITS.participantName);
        editingName = false;
      } else {
        notice = reply.error === "blocked_word" ? "Please choose another name." : "That name could not be saved.";
      }
    });
  }

  function ordinal(n: number): string {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]!);
  }

  const joinMessages: Record<JoinError, { title: string; body: string }> = {
    not_found: { title: "No session with that code", body: "Check the code on the screen and try again." },
    ended: { title: "This session has ended", body: "Thank you for taking part." },
    full: { title: "This session is full", body: "The room has reached its limit for this session. Let the presenter know." },
    busy: { title: "Connecting…", body: "Hold on, we are trying again." },
  };
</script>

<svelte:head>
  <title>{view ? view.title : "Join"} · Roomwave</title>
  <meta name="theme-color" content={theme.background} />
</svelte:head>

<div class="phone" class:dark={theme.dark} style={themeStyle(theme)}>
  <div class="glow" aria-hidden="true"></div>
  <header class="bar">
    <a href="/" class="mark" aria-label="Roomwave" data-sveltekit-reload>
      <svg viewBox="0 0 33 24" width="26" height="19" aria-hidden="true">
        {#each [[0, 9], [7, 15], [14, 22], [21, 15], [28, 24]] as [x, h] (x)}<rect x={x} y={24 - h!} width="5" height={h} rx="2.5" fill="currentColor" />{/each}
      </svg>
    </a>
    <p class="title">{view?.title ?? "Roomwave"}</p>
    <span class="conn" class:off={!connected} title={connected ? "Connected" : "Reconnecting"}></span>
  </header>

  <main id="main" class="body">
    {#if !connected && status === "live"}
      <p class="banner" role="status">Reconnecting… your answers are safe.</p>
    {/if}

    {#if status === "joining"}
      <div class="centre"><span class="spinner" aria-hidden="true"></span><p>Joining…</p></div>
    {:else if status === "error" && joinError}
      <div class="centre">
        <h1>{joinMessages[joinError].title}</h1>
        <p>{joinMessages[joinError].body}</p>
        {#if joinError !== "busy"}<a class="action" href="/join">Enter another code</a>{/if}
      </div>
    {:else if ended}
      <div class="centre">
        <h1>Thank you for taking part</h1>
        <p>The session has ended. The presenter has your answers.</p>
        <a class="action ghost" href="/" data-sveltekit-reload>Make your own with Roomwave</a>
      </div>
    {:else if view && slide}
      {#key slide.id}
        <section class="card" aria-live="polite">
          {#if slide.type === "content"}
            <p class="kind">On screen now</p>
            <h1 class="q">{slide.config.heading || "Look at the screen"}</h1>
            {#if slide.config.body}<p class="body-text">{slide.config.body}</p>{/if}
            <p class="hint">Questions appear here when the presenter asks one.</p>
          {:else}
            <p class="kind">
              {#if slide.type === "quiz"}Quiz{:else if slide.type === "poll"}{slide.config.multiple ? "Pick any" : "Pick one"}{:else if slide.type === "scale"}Rate it{:else if slide.type === "wordcloud"}In a word{:else}Ask a question{/if}
            </p>
            <h1 class="q">{slide.config.question}</h1>

            {#if view.state.locked}
              <p class="closed">Answers are closed for this question.</p>
            {/if}

            {#if slide.type === "poll"}
              {@const chosen = myAnswer?.type === "poll" ? myAnswer.optionIds : []}
              {@const selection = slide.config.multiple && pollChoice.length ? pollChoice : slide.config.multiple ? chosen : []}
              <div class="options" role="group" aria-label="Answers">
                {#each slide.config.options as option, i (option.id)}
                  {@const on = slide.config.multiple ? selection.includes(option.id) : chosen.includes(option.id)}
                  <button
                    type="button"
                    class="option"
                    class:on
                    aria-pressed={on}
                    disabled={busy || view.state.locked}
                    style={`--c:var(--t-c${i % 6})`}
                    onclick={() => {
                      if (slide.type !== "poll") return;
                      if (slide.config.multiple) {
                        const base = pollChoice.length ? pollChoice : chosen;
                        pollChoice = base.includes(option.id) ? base.filter((id) => id !== option.id) : [...base, option.id];
                      } else {
                        void respond({ type: "poll", optionIds: [option.id] });
                      }
                    }}
                  >
                    <span class="letter">{String.fromCharCode(65 + i)}</span>
                    <span class="label">{option.label}</span>
                    {#if on}<span class="tick" aria-hidden="true">✓</span>{/if}
                  </button>
                {/each}
              </div>
              {#if slide.config.multiple && !view.state.locked}
                <button
                  type="button"
                  class="action"
                  disabled={busy || !selection.length}
                  onclick={async () => {
                    if (await respond({ type: "poll", optionIds: selection })) pollChoice = [];
                  }}
                >
                  {chosen.length ? "Update my answer" : "Send"}
                </button>
              {/if}
              {#if chosen.length}
                <p class="sent">✓ Answer sent{slide.config.multiple ? "" : ". Tap another to change it"}.</p>
                {#if !view.state.resultsHidden}<MiniResults {slide} results={slideResults} />{/if}
              {/if}
            {:else if slide.type === "scale"}
              {@const chosen = myAnswer?.type === "scale" ? myAnswer.value : null}
              <div class="scale" style={`--n:${slide.config.max}`} role="group" aria-label="Rating">
                {#each Array.from({ length: slide.config.max }, (_, i) => i + 1) as value (value)}
                  <button
                    type="button"
                    class="step"
                    class:on={chosen === value}
                    aria-pressed={chosen === value}
                    disabled={busy || view.state.locked}
                    onclick={() => respond({ type: "scale", value })}
                  >
                    {value}
                  </button>
                {/each}
              </div>
              <div class="ends"><span>1 · {slide.config.minLabel}</span><span>{slide.config.max} · {slide.config.maxLabel}</span></div>
              {#if chosen !== null}
                <p class="sent">✓ You gave {chosen} out of {slide.config.max}. Tap another to change it.</p>
                {#if !view.state.resultsHidden}<MiniResults {slide} results={slideResults} />{/if}
              {/if}
            {:else if slide.type === "wordcloud"}
              {@const entries = myAnswer?.type === "wordcloud" ? myAnswer.entries : []}
              {#if entries.length < slide.config.maxEntries && !view.state.locked}
                <form class="word" onsubmit={sendWord}>
                  <label class="visually-hidden" for="word">Your answer</label>
                  <input id="word" bind:value={word} maxlength={LIMITS.wordLength} autocomplete="off" autocapitalize="off" enterkeyhint="send" placeholder="Type a word or two" />
                  <button type="submit" class="action" disabled={busy || !word.trim()}>Send</button>
                </form>
                <p class="hint">{slide.config.maxEntries - entries.length} of {slide.config.maxEntries} left · up to 3 words each</p>
              {/if}
              {#if entries.length}
                <ul class="chips" aria-label="You sent">
                  {#each entries as entry (entry)}<li>{entry}</li>{/each}
                </ul>
                {#if entries.length >= slide.config.maxEntries}<p class="sent">✓ Thank you. Watch the screen.</p>{/if}
                {#if !view.state.resultsHidden}<MiniResults {slide} results={slideResults} />{/if}
              {/if}
            {:else if slide.type === "quiz"}
              {@const phase = view.state.quiz?.phase ?? "ready"}
              {@const picked = myAnswer?.type === "quiz" ? myAnswer.optionId : null}
              {@const result = quizResults[slide.id]}
              <div class="player">
                {#if editingName}
                  <form class="name-form" onsubmit={saveName}>
                    <label class="visually-hidden" for="name">Your name</label>
                    <input id="name" bind:value={nameDraft} maxlength={LIMITS.participantName} autocomplete="nickname" />
                    <button type="submit" class="action small">Save</button>
                  </form>
                {:else}
                  <span>Playing as <strong>{name}</strong></span>
                  <button type="button" class="link" onclick={() => { nameDraft = name ?? ""; editingName = true; }}>Change</button>
                {/if}
              </div>

              {#if phase === "ready"}
                <p class="waiting">Get ready. The answers appear when the presenter starts the timer.</p>
              {:else if phase === "open"}
                <div class="countdown" aria-hidden="true"><span style={`--left:${(remaining ?? 0) / quizLimit}`}></span></div>
                <p class="seconds">{Math.ceil(remaining ?? 0)} seconds</p>
                <div class="tiles" role="group" aria-label="Answers">
                  {#each slide.config.options as option, i (option.id)}
                    <button
                      type="button"
                      class="tile"
                      class:picked={picked === option.id}
                      class:faded={picked !== null && picked !== option.id}
                      disabled={busy || picked !== null || remaining === 0}
                      style={`--c:var(--t-c${i})`}
                      onclick={() => respond({ type: "quiz", optionId: option.id })}
                    >
                      <span class="letter">{String.fromCharCode(65 + i)}</span>
                      <span>{option.label}</span>
                    </button>
                  {/each}
                </div>
                {#if picked}<p class="sent">✓ Locked in. Fingers crossed.</p>{/if}
              {:else if phase === "reveal" || phase === "leaderboard"}
                {#if result}
                  <div class="verdict" class:right={result.correct} class:wrong={!result.correct}>
                    <p class="verdict-title">{result.correct ? "Correct!" : result.answered ? "Not this time" : "No answer"}</p>
                    <p class="points">+{result.points.toLocaleString("en-KE")} points</p>
                    <p>{result.score.toLocaleString("en-KE")} in total · {ordinal(result.rank)} of {result.of}</p>
                  </div>
                {:else}
                  <p class="waiting">The answer is on the screen.</p>
                {/if}
                {#if phase === "leaderboard" && boards[slide.id]}
                  <ol class="board">
                    {#each boards[slide.id]!.slice(0, 5) as entry (entry.participantId)}
                      <li class:me={entry.participantId === participantId}>
                        <span class="rank">{entry.rank}</span><span class="who">{entry.name}</span><span class="score">{entry.score.toLocaleString("en-KE")}</span>
                      </li>
                    {/each}
                  </ol>
                {/if}
              {/if}
            {:else if slide.type === "qna"}
              {@const mineQna = myAnswer?.type === "qna" ? myAnswer : { asked: [] as Question[], upvoted: [] as string[] }}
              {@const askedIds = new Set(mineQna.asked.map((q) => q.id))}
              {@const shown = slideResults?.type === "qna" ? slideResults.questions : []}
              {#if !view.state.locked}
                <form class="ask" onsubmit={ask}>
                  <label class="visually-hidden" for="question">Your question</label>
                  <textarea id="question" bind:value={question} maxlength={LIMITS.questionText} rows="3" placeholder="Type your question"></textarea>
                  {#if slide.config.allowNames}
                    <label class="visually-hidden" for="ask-name">Your name (optional)</label>
                    <input id="ask-name" bind:value={askName} maxlength={LIMITS.participantName} placeholder="Your name (optional)" autocomplete="given-name" />
                  {/if}
                  <button type="submit" class="action" disabled={busy || question.trim().length < 2}>Send question</button>
                </form>
              {/if}
              {#each mineQna.asked.filter((q) => q.status === "pending" && !shown.some((s) => s.id === q.id)) as pendingQ (pendingQ.id)}
                <p class="pending">Waiting for approval: “{pendingQ.text}”</p>
              {/each}
              {#if shown.length}
                <h2 class="list-title">Upvote the ones you want answered</h2>
                <ul class="questions">
                  {#each shown as q (q.id)}
                    <li class:answered={q.status === "answered"}>
                      <div class="q-body">
                        <p>{q.text}</p>
                        <span>{q.name ?? "Anonymous"}{askedIds.has(q.id) ? " · yours" : ""}{q.status === "answered" ? " · answered" : ""}</span>
                      </div>
                      {#if askedIds.has(q.id) || q.status === "answered"}
                        <span class="votes static">{q.upvotes}</span>
                      {:else}
                        <button
                          type="button"
                          class="votes"
                          class:on={mineQna.upvoted.includes(q.id)}
                          aria-pressed={mineQna.upvoted.includes(q.id)}
                          aria-label={`Upvote: ${q.text}`}
                          onclick={() => upvote(q.id)}
                        >
                          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3 14 11H2z" fill="currentColor" /></svg>
                          {q.upvotes}
                        </button>
                      {/if}
                    </li>
                  {/each}
                </ul>
              {/if}
            {/if}

            {#if notice}<p class="notice-line" role="alert">{notice}</p>{/if}
          {/if}
        </section>
      {/key}
    {/if}
  </main>
</div>

<style>
  .phone {
    position: relative;
    min-height: 100dvh;
    background: var(--t-bg);
    color: var(--t-text);
    isolation: isolate;
  }

  .glow {
    position: fixed;
    inset: 0;
    z-index: -1;
    background: var(--t-glow);
    pointer-events: none;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 560px;
    margin: 0 auto;
    padding: 14px 18px;
  }

  .mark {
    display: grid;
    color: var(--t-accent);
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
    font-size: 0.95rem;
    color: var(--t-muted);
  }

  .conn {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--t-correct);
  }

  .conn.off {
    background: var(--sun);
    animation: rw-pulse 1s ease-in-out infinite;
  }

  .body {
    max-width: 560px;
    margin: 0 auto;
    padding: 8px 18px 48px;
  }

  .banner {
    margin-bottom: 12px;
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--sun);
    color: var(--ink);
    font-weight: 600;
    font-size: 0.92rem;
  }

  .centre {
    display: grid;
    justify-items: center;
    gap: 12px;
    padding: 18vh 8px 0;
    text-align: center;
  }

  .centre h1 {
    font-size: 1.9rem;
  }

  .centre p {
    color: var(--t-muted);
  }

  .card {
    animation: enter 380ms var(--ease-out);
  }

  .kind {
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--t-accent);
  }

  .q {
    margin: 8px 0 22px;
    font-size: clamp(1.6rem, 6.4vw, 2.1rem);
    line-height: 1.08;
  }

  .body-text,
  .hint,
  .waiting {
    color: var(--t-muted);
  }

  .hint {
    margin-top: 10px;
    font-size: 0.88rem;
  }

  .closed {
    margin: -8px 0 16px;
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--t-surface);
    border: 1px solid var(--t-line);
    font-weight: 600;
  }

  .options {
    display: grid;
    gap: 10px;
  }

  .option {
    display: grid;
    grid-template-columns: 36px 1fr auto;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 60px;
    padding: 10px 14px;
    border: 2px solid var(--t-line);
    border-radius: 16px;
    background: var(--t-surface);
    color: var(--t-text);
    font-size: 1.05rem;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    transition:
      border-color 120ms ease,
      transform 120ms ease;
  }

  .option:active:not(:disabled) {
    transform: scale(0.98);
  }

  .option.on {
    border-color: var(--c);
    box-shadow: inset 0 0 0 1px var(--c);
  }

  .option:disabled {
    cursor: default;
  }

  .option .letter {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: var(--c);
    color: var(--t-bg);
    font-weight: 800;
  }

  .option .label {
    overflow-wrap: anywhere;
  }

  .tick {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--c);
    color: var(--t-bg);
    font-weight: 800;
  }

  .action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 54px;
    margin-top: 14px;
    padding: 0 20px;
    border: 0;
    border-radius: 999px;
    background: var(--t-accent);
    color: var(--t-on-accent);
    font-size: 1.05rem;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }

  .action:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .action.ghost {
    background: transparent;
    color: var(--t-text);
    border: 2px solid var(--t-line);
  }

  .action.small {
    width: auto;
    min-height: 44px;
    margin: 0;
  }

  .sent {
    margin-top: 14px;
    font-weight: 600;
    color: var(--t-correct);
  }

  .scale {
    display: grid;
    grid-template-columns: repeat(var(--n), minmax(0, 1fr));
    gap: 6px;
  }

  .step {
    min-height: 56px;
    border: 2px solid var(--t-line);
    border-radius: 12px;
    background: var(--t-surface);
    color: var(--t-text);
    font-family: var(--font-display);
    font-size: 1.3rem;
    font-weight: 700;
    cursor: pointer;
  }

  .step.on {
    border-color: var(--t-accent);
    background: var(--t-accent);
    color: var(--t-on-accent);
  }

  .ends {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    margin-top: 10px;
    font-size: 0.85rem;
    color: var(--t-muted);
  }

  .ends span:last-child {
    text-align: right;
  }

  .word {
    display: grid;
    gap: 0;
  }

  .word input,
  .ask textarea,
  .ask input,
  .name-form input {
    width: 100%;
    min-height: 56px;
    padding: 12px 16px;
    border: 2px solid var(--t-line);
    border-radius: 14px;
    background: var(--t-surface);
    color: var(--t-text);
    font-size: 1.1rem;
  }

  .word input:focus,
  .ask textarea:focus,
  .ask input:focus,
  .name-form input:focus {
    outline: none;
    border-color: var(--t-accent);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 16px 0 0;
    padding: 0;
    list-style: none;
  }

  .chips li {
    padding: 8px 14px;
    border-radius: 999px;
    background: var(--t-accent);
    color: var(--t-on-accent);
    font-weight: 700;
  }

  .player {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin: -8px 0 18px;
    font-size: 0.92rem;
    color: var(--t-muted);
  }

  .player strong {
    color: var(--t-text);
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--t-accent);
    font-weight: 700;
    text-decoration: underline;
    cursor: pointer;
  }

  .name-form {
    display: flex;
    gap: 8px;
    width: 100%;
  }

  .name-form input {
    min-height: 44px;
    font-size: 1rem;
  }

  .countdown {
    height: 10px;
    border-radius: 999px;
    background: var(--t-track);
    overflow: hidden;
  }

  .countdown span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--t-accent);
    transform-origin: 0 50%;
    transform: scaleX(var(--left));
    transition: transform 200ms linear;
  }

  .seconds {
    margin: 8px 0 14px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .tiles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .tile {
    display: grid;
    align-content: space-between;
    gap: 10px;
    min-height: 120px;
    padding: 14px;
    border: 0;
    border-radius: 18px;
    background: var(--c);
    color: var(--t-bg);
    font-size: 1.05rem;
    font-weight: 700;
    text-align: left;
    overflow-wrap: anywhere;
    cursor: pointer;
    transition:
      opacity 200ms ease,
      transform 120ms ease;
  }

  .tile:active:not(:disabled) {
    transform: scale(0.97);
  }

  .tile .letter {
    font-family: var(--font-display);
    font-size: 1.8rem;
    line-height: 1;
  }

  .tile.faded {
    opacity: 0.3;
  }

  .tile.picked {
    box-shadow:
      0 0 0 3px var(--t-bg),
      0 0 0 6px var(--c);
  }

  .tile:disabled {
    cursor: default;
  }

  .verdict {
    display: grid;
    gap: 4px;
    padding: 22px;
    border-radius: 18px;
    text-align: center;
  }

  .verdict.right {
    background: var(--t-correct);
    color: var(--t-bg);
  }

  .verdict.wrong {
    background: var(--t-surface);
    border: 1px solid var(--t-line);
  }

  .verdict-title {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 800;
  }

  .points {
    font-family: var(--font-display);
    font-size: 1.4rem;
    font-weight: 700;
  }

  .board {
    display: grid;
    gap: 6px;
    margin: 18px 0 0;
    padding: 0;
    list-style: none;
  }

  .board li {
    display: grid;
    grid-template-columns: 30px 1fr auto;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--t-surface);
  }

  .board li.me {
    box-shadow: inset 0 0 0 2px var(--t-accent);
  }

  .rank,
  .score {
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .who {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ask {
    display: grid;
    gap: 10px;
  }

  .ask textarea {
    min-height: 96px;
    resize: vertical;
    font-size: 1.05rem;
  }

  .ask .action {
    margin-top: 0;
  }

  .pending {
    margin-top: 14px;
    padding: 10px 14px;
    border-radius: 12px;
    border: 1px dashed var(--t-line);
    color: var(--t-muted);
    font-size: 0.92rem;
  }

  .list-title {
    margin: 26px 0 10px;
    font-family: var(--font-text);
    font-size: 0.8rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--t-muted);
  }

  .questions {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .questions li {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 12px 12px 12px 16px;
    border-radius: 14px;
    background: var(--t-surface);
    border: 1px solid var(--t-line);
  }

  .questions li.answered {
    opacity: 0.6;
  }

  .q-body p {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .q-body span {
    font-size: 0.82rem;
    color: var(--t-muted);
  }

  .votes {
    display: grid;
    justify-items: center;
    gap: 2px;
    min-width: 52px;
    padding: 8px 6px;
    border: 2px solid var(--t-line);
    border-radius: 12px;
    background: transparent;
    color: var(--t-text);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }

  .votes svg {
    width: 14px;
    height: 14px;
  }

  .votes.on {
    border-color: var(--t-accent);
    background: var(--t-accent);
    color: var(--t-on-accent);
  }

  .votes.static {
    border-style: dashed;
    cursor: default;
  }

  .notice-line {
    margin-top: 14px;
    padding: 10px 14px;
    border-radius: 12px;
    background: var(--t-surface);
    border: 1px solid var(--t-accent);
    font-weight: 600;
  }

  .spinner {
    width: 34px;
    height: 34px;
    border: 3px solid var(--t-accent);
    border-right-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes enter {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }
</style>
