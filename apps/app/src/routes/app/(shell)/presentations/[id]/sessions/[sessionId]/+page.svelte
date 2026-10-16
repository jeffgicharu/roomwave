<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";

  import { SLIDE_TYPE_LABELS, formatJoinCode, slideTitle, type SessionResults } from "@roomwave/shared";
  import { BarChart, Leaderboard, ScaleChart, THEMES_BY_ID, WordCloud, themeStyle } from "@roomwave/ui";

  import { del, get, post, RequestError } from "#lib/api.ts";
  import Dialog from "#lib/components/Dialog.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import TypeIcon from "#lib/components/TypeIcon.svelte";
  import { formatDateTime, plural } from "#lib/format.ts";
  import { session as account } from "#lib/session.svelte.ts";
  import { toasts } from "#lib/toast.svelte.ts";

  const presentationId = $derived(page.params.id!);
  const sessionId = $derived(page.params.sessionId!);

  let data = $state<SessionResults | null>(null);
  let message = $state("");
  let pdfState = $state<"idle" | "working">("idle");
  let emailing = $state(false);
  let confirmDelete = $state(false);
  let confirmEnd = $state(false);

  const paper = THEMES_BY_ID.paper;

  async function load() {
    try {
      data = await get<SessionResults>(`/api/sessions/${sessionId}/results`);
    } catch (error) {
      message = error instanceof RequestError ? error.message : "Could not load these results.";
    }
  }

  onMount(load);

  async function downloadPdf() {
    pdfState = "working";
    try {
      // The report is drawn in the background; ask until it is ready.
      for (let attempt = 0; attempt < 40; attempt++) {
        const { status } = await post<{ status: "ready" | "pending" }>(`/api/sessions/${sessionId}/report`);
        if (status === "ready") {
          location.href = `/api/sessions/${sessionId}/report.pdf`;
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
      toasts.show("The report is taking longer than usual. Try again in a minute.", "error");
    } catch (error) {
      toasts.show(error instanceof RequestError ? error.message : "Could not make the report.", "error");
    } finally {
      pdfState = "idle";
    }
  }

  async function emailReport() {
    emailing = true;
    try {
      const { to } = await post<{ to: string }>(`/api/sessions/${sessionId}/email`);
      toasts.show(`The report is on its way to ${to}.`);
    } catch (error) {
      toasts.show(error instanceof RequestError ? error.message : "Could not send the report.", "error");
    } finally {
      emailing = false;
    }
  }

  async function endNow() {
    confirmEnd = false;
    try {
      await post(`/api/sessions/${sessionId}/end`);
      toasts.show("The session has ended.");
      await load();
    } catch (error) {
      toasts.show(error instanceof RequestError ? error.message : "Could not end the session.", "error");
    }
  }

  async function remove() {
    confirmDelete = false;
    try {
      await del(`/api/sessions/${sessionId}`);
      toasts.show("Those results have been deleted.");
      await goto(`/app/presentations/${presentationId}/results`);
    } catch (error) {
      toasts.show(error instanceof RequestError ? error.message : "Could not delete the results.", "error");
    }
  }
</script>

<svelte:head>
  <title>{data ? `${data.session.title} · Results` : "Results"} · Roomwave</title>
</svelte:head>

<nav class="crumbs" aria-label="Breadcrumb">
  <a href="/app">Presentations</a>
  <Icon name="chevron-right" size={14} />
  <a href={`/app/presentations/${presentationId}/results`}>Results</a>
  <Icon name="chevron-right" size={14} />
  <span aria-current="page">{data ? formatDateTime(data.session.startedAt) : "Session"}</span>
</nav>

{#if message}
  <h1 class="visually-hidden">Session results</h1>
  <p class="notice notice-error" role="alert">{message}</p>
{:else if !data}
  <p class="loading" aria-busy="true">Loading…</p>
{:else}
  {@const s = data.session}
  <header class="head">
    <div class="title">
      <p class="eyebrow">
        {#if !s.endedAt}<span class="badge badge-live">Live now</span>{/if}
        {formatDateTime(s.startedAt)} · code {formatJoinCode(s.code)}
      </p>
      <h1>{s.title}</h1>
    </div>
    <dl class="stats">
      <div><dt>People</dt><dd>{s.participants}</dd></div>
      <div><dt>Answers</dt><dd>{s.responses}</dd></div>
      <div><dt>Slides with questions</dt><dd>{data.slides.filter((x) => x.type !== "content").length}</dd></div>
    </dl>
  </header>

  <div class="toolbar">
    <a class="btn btn-small" href={`/api/sessions/${sessionId}/export.csv`} download><Icon name="download" size={16} /> Spreadsheet (CSV)</a>
    {#if data.canPdf}
      <button class="btn btn-small btn-ghost" type="button" disabled={pdfState === "working"} onclick={downloadPdf}>
        <Icon name="download" size={16} /> {pdfState === "working" ? "Making the PDF…" : "PDF report"}
      </button>
    {:else}
      <a class="btn btn-small btn-ghost" href="/app/billing" title="PDF reports come with Pro"><Icon name="lock" size={16} /> PDF report <span class="badge badge-pro">Pro</span></a>
    {/if}
    {#if data.canEmail}
      <button class="btn btn-small btn-ghost" type="button" disabled={emailing} onclick={emailReport}><Icon name="mail" size={16} /> {emailing ? "Sending…" : "Email it to me"}</button>
    {:else if account.user?.isGuest}
      <span class="hint">Create an account to email reports to yourself.</span>
    {/if}
    <span class="spacer"></span>
    {#if !s.endedAt}
      <a class="btn btn-small btn-signal" href={`/present/${sessionId}`}><Icon name="play" size={14} filled /> Back to presenting</a>
      <button class="btn btn-small btn-ghost" type="button" onclick={() => (confirmEnd = true)}>End session</button>
    {:else}
      <button class="btn btn-small btn-ghost danger" type="button" onclick={() => (confirmDelete = true)}><Icon name="trash" size={16} /> Delete</button>
    {/if}
  </div>

  <ol class="slides">
    {#each data.slides as slide, i (slide.id)}
      {@const result = data.results[slide.id]}
      {#if slide.type !== "content" && result}
        <li class="card" style={themeStyle(paper)}>
          <header>
            <span class="kind"><TypeIcon type={slide.type} size={16} /> Slide {i + 1} · {SLIDE_TYPE_LABELS[slide.type]}</span>
            <h2>{slideTitle(slide)}</h2>
          </header>
          {#if (result.type === "poll" || result.type === "quiz") && (slide.type === "poll" || slide.type === "quiz")}
            <div class="chart rows">
              <BarChart options={slide.config.options} counts={result.counts} respondents={result.respondents} layout="rows" correctId={slide.type === "quiz" ? slide.config.correctOptionId : null} letters={slide.type === "quiz"} />
            </div>
            <p class="foot">{plural(result.respondents, "answer")}</p>
          {:else if result.type === "scale" && slide.type === "scale"}
            <div class="chart scale">
              <ScaleChart max={slide.config.max} counts={result.counts} average={result.average} minLabel={slide.config.minLabel} maxLabel={slide.config.maxLabel} />
            </div>
            <p class="foot">{plural(result.respondents, "answer")}</p>
          {:else if result.type === "wordcloud"}
            <div class="chart cloud"><WordCloud words={result.words} empty="Nobody sent a word." /></div>
            <p class="foot">{plural(result.entries, "word")} from {plural(result.respondents, "person", "people")}</p>
          {:else if result.type === "qna"}
            {@const shown = result.questions.filter((q) => q.status !== "hidden")}
            {#if shown.length}
              <ul class="questions">
                {#each shown as q (q.id)}
                  <li>
                    <span class="votes">{q.upvotes}</span>
                    <span class="q">{q.text}<small>{q.name ?? "Anonymous"}{q.status === "answered" ? " · answered" : ""}{q.status === "pending" ? " · never shown" : ""}</small></span>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="foot">No questions were asked.</p>
            {/if}
          {/if}
        </li>
      {/if}
    {/each}
    {#if data.leaderboard.length}
      <li class="card" style={themeStyle(paper)}>
        <div class="chart board"><Leaderboard entries={data.leaderboard} title="Quiz leaderboard" /></div>
      </li>
    {/if}
  </ol>
{/if}

<Dialog bind:open={confirmDelete} title="Delete these results?" description="The answers from this session are removed for good. The presentation itself stays.">
  {#snippet actions()}
    <button class="btn btn-ghost" type="button" onclick={() => (confirmDelete = false)}>Keep them</button>
    <button class="btn btn-danger" type="button" onclick={remove}>Delete results</button>
  {/snippet}
  <span></span>
</Dialog>

<Dialog bind:open={confirmEnd} title="End the session now?" description="Phones see that it has ended and the code stops working. The answers are kept.">
  {#snippet actions()}
    <button class="btn btn-ghost" type="button" onclick={() => (confirmEnd = false)}>Keep it running</button>
    <button class="btn btn-danger" type="button" onclick={endNow}>End the session</button>
  {/snippet}
  <span></span>
</Dialog>

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
    gap: 20px 40px;
  }

  .title {
    min-width: 0;
  }

  .eyebrow {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  h1 {
    margin-top: 10px;
    font-size: var(--step-4);
    overflow-wrap: anywhere;
  }

  .stats {
    display: flex;
    gap: 28px;
    margin: 0;
  }

  .stats dt {
    font-size: 0.85rem;
    color: var(--ink-3);
  }

  .stats dd {
    margin: 0;
    font-family: var(--font-display);
    font-size: 2.2rem;
    font-weight: 700;
    line-height: 1.1;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 28px 0;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    background: var(--card);
  }

  .spacer {
    flex: 1;
  }

  .danger {
    color: var(--danger);
  }

  .slides {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 480px), 1fr));
    align-items: start;
    gap: 20px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: grid;
    gap: 16px;
    align-content: start;
    padding: 22px;
    border: 1px solid var(--line);
    border-radius: var(--radius-l);
    background: var(--card);
  }

  .card header {
    display: grid;
    gap: 6px;
  }

  .kind {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .card h2 {
    font-size: 1.35rem;
    line-height: 1.2;
  }

  /* The charts are sized in units; on this page one unit is a few pixels. */
  .chart {
    --unit: 8.5px;
    --min-text: 13px;
  }

  .chart.scale {
    height: 230px;
    --unit: 8px;
  }

  .chart.cloud {
    height: 260px;
  }

  .chart.board {
    --unit: 8px;
  }

  @media (max-width: 520px) {
    .chart {
      --unit: 7px;
    }

    .chart.scale {
      height: 200px;
      --unit: 6px;
    }
  }

  .foot {
    font-size: 0.88rem;
    color: var(--ink-3);
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
    grid-template-columns: 48px 1fr;
    gap: 12px;
    align-items: start;
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }

  .votes {
    display: grid;
    place-items: center;
    height: 40px;
    border-radius: 10px;
    background: var(--signal-soft);
    font-family: var(--font-display);
    font-weight: 700;
  }

  .q {
    display: grid;
    gap: 2px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .q small {
    font-weight: 400;
    color: var(--ink-3);
  }

  .loading {
    color: var(--ink-3);
  }
</style>
