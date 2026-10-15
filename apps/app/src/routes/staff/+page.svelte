<script lang="ts">
  import { onMount } from "svelte";

  import type { StaffOverview } from "@roomwave/shared";

  import "#lib/styles/staff.css";
  import { get, RequestError } from "#lib/api.ts";
  import DailyBars from "#lib/components/DailyBars.svelte";
  import Icon from "#lib/components/Icon.svelte";

  let data = $state<StaffOverview | null>(null);
  let message = $state("");

  async function load() {
    try {
      data = await get<StaffOverview>("/api/staff/overview");
      message = "";
    } catch (error) {
      message = error instanceof RequestError ? error.message : "Could not load the overview.";
    }
  }

  onMount(() => {
    void load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  });

  const tiles = $derived(
    data
      ? [
          { label: "Live sessions", value: data.liveSessions, href: "/staff/sessions" },
          { label: "Connected now", value: data.connectedNow, href: "/staff/sessions" },
          { label: "Answers today", value: data.responsesToday, href: null },
          { label: "Accounts", value: data.accounts, href: "/staff/customers" },
          { label: "Sign-ups today", value: data.signupsToday, href: "/staff/customers" },
          { label: "On a trial", value: data.onTrial, href: "/staff/customers?plan=trial" },
          { label: "Paying", value: data.paying, href: "/staff/customers?plan=paid" },
          { label: "Open requests", value: data.openRequests, href: "/staff/requests" },
        ]
      : [],
  );
</script>

<svelte:head>
  <title>Overview · Staff · Roomwave</title>
</svelte:head>

<header class="staff-head">
  <div>
    <h1>Overview</h1>
    <p>Updated every 15 seconds. Times are East Africa Time.</p>
  </div>
</header>

{#if message}
  <p class="notice notice-error" role="alert">{message}</p>
{/if}

{#if data}
  <ul class="tiles">
    {#each tiles as tile (tile.label)}
      <li>
        {#if tile.href}
          <a href={tile.href}><span class="value">{tile.value.toLocaleString("en-KE")}</span><span class="label-text">{tile.label}</span><Icon name="chevron-right" size={16} /></a>
        {:else}
          <div><span class="value">{tile.value.toLocaleString("en-KE")}</span><span class="label-text">{tile.label}</span></div>
        {/if}
      </li>
    {/each}
  </ul>

  <section class="staff-panel chart">
    <DailyBars days={data.signupsByDay} label="Sign-ups, last 14 days" />
  </section>
{:else if !message}
  <p class="staff-empty" aria-busy="true">Loading…</p>
{/if}

<style>
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin: 0 0 20px;
    padding: 0;
    list-style: none;
  }

  .tiles a,
  .tiles div {
    position: relative;
    display: grid;
    gap: 2px;
    padding: 18px 18px 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    background: var(--card);
    text-decoration: none;
  }

  .tiles a:hover {
    border-color: var(--ink-4);
  }

  .tiles :global(svg) {
    position: absolute;
    top: 16px;
    right: 14px;
    color: var(--ink-4);
  }

  .value {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .label-text {
    font-size: 0.88rem;
    color: var(--ink-3);
  }

  @media (max-width: 1000px) {
    .tiles {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
