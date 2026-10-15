<script lang="ts">
  import { onMount } from "svelte";

  import type { StaffHealth } from "@roomwave/shared";

  import "#lib/styles/staff.css";
  import { get, RequestError } from "#lib/api.ts";
  import { timeAgo } from "#lib/format.ts";

  let data = $state<StaffHealth | null>(null);
  let message = $state("");

  async function load() {
    try {
      data = await get<StaffHealth>("/api/staff/health");
      message = "";
    } catch (error) {
      message = error instanceof RequestError ? error.message : "Could not load system health.";
    }
  }

  onMount(() => {
    void load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  });

  function uptime(seconds: number): string {
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min`;
    if (seconds < 86_400) return `${Math.floor(seconds / 3600)} h ${Math.floor((seconds % 3600) / 60)} min`;
    return `${Math.floor(seconds / 86_400)} days`;
  }

  // Memory against the process's hard limit: fine below 70%, watch it to 85%, act above.
  function level(used: number, limit: number): { label: string; tone: string } {
    const share = used / limit;
    if (share < 0.7) return { label: "Fine", tone: "good" };
    if (share < 0.85) return { label: "Watch", tone: "warning" };
    return { label: "High", tone: "critical" };
  }
</script>

<svelte:head>
  <title>System health · Staff · Roomwave</title>
</svelte:head>

<header class="staff-head">
  <div>
    <h1>System health</h1>
    <p>Each process reports every 10 seconds. A process that stops reporting drops off this page after 30 seconds.</p>
  </div>
</header>

{#if message}
  <p class="notice notice-error" role="alert">{message}</p>
{:else if !data}
  <p class="staff-empty" aria-busy="true">Loading…</p>
{:else}
  <ul class="processes">
    {#each data.processes as p (p.name)}
      {@const memory = level(p.memoryMb, p.limitMb)}
      <li class="staff-panel">
        <header>
          <h2>{p.name.startsWith("web") ? `Web and live server (${p.name.replace("web-", "port ")})` : "Background worker"}</h2>
          <span class="status {memory.tone}"><span class="dot" aria-hidden="true"></span>{memory.label}</span>
        </header>
        <div class="meter" role="meter" aria-valuemin="0" aria-valuemax={p.limitMb} aria-valuenow={p.memoryMb} aria-label="Memory used">
          <span class={memory.tone} style={`width:${Math.min(100, (p.memoryMb / p.limitMb) * 100)}%`}></span>
        </div>
        <p class="meter-label"><strong>{p.memoryMb} MB</strong> of {p.limitMb} MB memory</p>
        <dl>
          <div><dt>Event loop delay</dt><dd>{p.eventLoopDelayMs} ms</dd></div>
          <div><dt>Live connections</dt><dd>{p.connections ?? "–"}</dd></div>
          <div><dt>Up for</dt><dd>{uptime(p.uptimeSeconds)}</dd></div>
          <div><dt>Release</dt><dd><code>{p.release}</code></dd></div>
        </dl>
        <p class="staff-sub">Reported {timeAgo(p.reportedAt)}</p>
      </li>
    {:else}
      <li class="staff-panel"><p class="staff-empty">No process has reported in the last 30 seconds.</p></li>
    {/each}
  </ul>

  <div class="grid">
    <section class="staff-panel">
      <h2>Job queue</h2>
      <dl class="counts">
        <div><dt>Waiting</dt><dd>{data.queue.waiting}</dd></div>
        <div><dt>Running</dt><dd>{data.queue.active}</dd></div>
        <div><dt>Scheduled</dt><dd>{data.queue.delayed}</dd></div>
        <div><dt>Failed</dt><dd class:bad={data.queue.failed > 0}>{data.queue.failed}</dd></div>
      </dl>
    </section>
    <section class="staff-panel">
      <h2>Email</h2>
      <div class="meter" role="meter" aria-valuemin="0" aria-valuemax={data.emailsPerDay} aria-valuenow={data.emailsToday} aria-label="Emails sent in the last 24 hours">
        <span class={data.emailsToday >= data.emailsPerDay ? "critical" : "good"} style={`width:${Math.min(100, (data.emailsToday / Math.max(1, data.emailsPerDay)) * 100)}%`}></span>
      </div>
      <p class="meter-label"><strong>{data.emailsToday}</strong> of {data.emailsPerDay} sent in the last 24 hours</p>
    </section>
    <section class="staff-panel">
      <h2>Database</h2>
      <dl class="counts">
        <div><dt>Size</dt><dd>{data.database.sizeMb} MB</dd></div>
        <div><dt>Connections</dt><dd>{data.database.connections}</dd></div>
      </dl>
    </section>
  </div>
{/if}

<style>
  .processes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
    gap: 16px;
    margin: 0 0 16px;
    padding: 0;
    list-style: none;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 14px;
  }

  h2 {
    font-size: 1.1rem;
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.85rem;
    font-weight: 700;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: currentColor;
  }

  .good {
    color: var(--success);
  }

  .warning {
    color: #9a6400;
  }

  .critical {
    color: var(--danger);
  }

  .meter {
    height: 10px;
    border-radius: 999px;
    background: var(--paper-2);
    overflow: hidden;
  }

  .meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: currentColor;
  }

  .meter-label {
    margin: 8px 0 14px;
    font-size: 0.9rem;
    color: var(--ink-3);
  }

  .meter-label strong {
    color: var(--ink);
  }

  dl {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 0 0 12px;
  }

  dt {
    font-size: 0.8rem;
    color: var(--ink-3);
  }

  dd {
    margin: 2px 0 0;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .counts dd {
    font-family: var(--font-display);
    font-size: 1.6rem;
  }

  .counts .bad {
    color: var(--danger);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
    gap: 16px;
  }
</style>
