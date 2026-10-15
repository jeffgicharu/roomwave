<script lang="ts">
  import { page } from "$app/state";
  import { onMount } from "svelte";

  import { PLANS, type PlanId } from "@roomwave/shared";

  import "#lib/styles/staff.css";
  import { get, post, RequestError } from "#lib/api.ts";
  import Dialog from "#lib/components/Dialog.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import { daysLeft, formatDate, formatDateTime, timeAgo } from "#lib/format.ts";
  import { toasts } from "#lib/toast.svelte.ts";

  interface Detail {
    customer: {
      id: string;
      name: string;
      email: string | null;
      organisation: string | null;
      plan: PlanId;
      onTrial: boolean;
      trialEndsAt: string | null;
      trialUsed: boolean;
      isGuest: boolean;
      guestExpiresAt: string | null;
      suspended: boolean;
      suspendedAt: string | null;
      lastActiveAt: string | null;
      createdAt: string;
    };
    presentations: { id: string; title: string; slides: number; updatedAt: string }[];
    sessions: { id: string; title: string; code: string; startedAt: string; endedAt: string | null; participants: number }[];
    actions: { action: string; detail: string | null; staff: string; at: string }[];
  }

  const id = $derived(page.params.id!);
  let data = $state<Detail | null>(null);
  let message = $state("");
  let confirmSuspend = $state(false);
  let busy = $state(false);

  const ACTIONS: Record<string, string> = {
    extend_trial: "Extended the trial",
    suspend: "Suspended the account",
    unsuspend: "Lifted the suspension",
    end_session: "Ended a live session",
  };

  async function load() {
    try {
      data = await get<Detail>(`/api/staff/customers/${id}`);
    } catch (error) {
      message = error instanceof RequestError ? error.message : "Could not load this customer.";
    }
  }

  onMount(load);

  async function extend() {
    busy = true;
    try {
      const { trialEndsAt } = await post<{ trialEndsAt: string }>(`/api/staff/customers/${id}/extend-trial`);
      toasts.show(`Trial extended to ${formatDate(trialEndsAt)}.`);
      await load();
    } catch (error) {
      toasts.show(error instanceof RequestError ? error.message : "Could not extend the trial.", "error");
    } finally {
      busy = false;
    }
  }

  async function setSuspended(suspended: boolean) {
    confirmSuspend = false;
    busy = true;
    try {
      await post(`/api/staff/customers/${id}/suspend`, { suspended });
      toasts.show(suspended ? "Account suspended and signed out." : "Suspension lifted.");
      await load();
    } catch (error) {
      toasts.show(error instanceof RequestError ? error.message : "That did not work.", "error");
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>{data ? data.customer.name : "Customer"} · Staff · Roomwave</title>
</svelte:head>

<nav class="crumbs" aria-label="Breadcrumb"><a href="/staff/customers">Customers</a> <Icon name="chevron-right" size={14} /> <span aria-current="page">{data?.customer.name ?? "…"}</span></nav>

{#if message}
  <p class="notice notice-error" role="alert">{message}</p>
{:else if !data}
  <p class="staff-empty" aria-busy="true">Loading…</p>
{:else}
  {@const c = data.customer}
  <header class="staff-head">
    <div>
      <h1>{c.isGuest ? "Guest workspace" : c.name}</h1>
      <p>{c.email ?? "No email yet"}{c.organisation ? ` · ${c.organisation}` : ""}</p>
    </div>
    <div class="actions">
      {#if c.plan === "free" && !c.isGuest}
        <button class="btn btn-small" type="button" disabled={busy} onclick={extend}><Icon name="clock" size={16} /> {c.onTrial ? "Add 7 days to the trial" : "Give a 7-day trial"}</button>
      {/if}
      {#if c.suspended}
        <button class="btn btn-small btn-ghost" type="button" disabled={busy} onclick={() => setSuspended(false)}>Lift the suspension</button>
      {:else}
        <button class="btn btn-small btn-ghost danger" type="button" disabled={busy} onclick={() => (confirmSuspend = true)}>Suspend</button>
      {/if}
    </div>
  </header>

  <dl class="facts">
    <div>
      <dt>Plan</dt>
      <dd>
        {c.isGuest ? "Guest" : PLANS[c.plan].name}
        {#if c.onTrial && c.trialEndsAt}<span class="badge badge-trial">Pro trial · {daysLeft(c.trialEndsAt)} days left</span>{/if}
        {#if c.suspended}<span class="badge suspended">Suspended {c.suspendedAt ? timeAgo(c.suspendedAt) : ""}</span>{/if}
      </dd>
    </div>
    <div><dt>Joined</dt><dd>{formatDate(c.createdAt)}</dd></div>
    <div><dt>Last active</dt><dd>{c.lastActiveAt ? timeAgo(c.lastActiveAt) : "Never"}</dd></div>
    {#if c.isGuest && c.guestExpiresAt}<div><dt>Deleted</dt><dd>{timeAgo(c.guestExpiresAt)}</dd></div>{/if}
  </dl>

  <div class="columns">
    <section class="staff-panel">
      <h2>Presentations · {data.presentations.length}</h2>
      {#if data.presentations.length}
        <ul class="list">
          {#each data.presentations as p (p.id)}<li><strong>{p.title}</strong><span class="staff-sub">{p.slides} slides · edited {timeAgo(p.updatedAt)}</span></li>{/each}
        </ul>
      {:else}<p class="quiet">None yet.</p>{/if}
    </section>
    <section class="staff-panel">
      <h2>Sessions · {data.sessions.length}</h2>
      {#if data.sessions.length}
        <ul class="list">
          {#each data.sessions as s (s.id)}
            <li>
              <strong>{s.title}</strong>
              <span class="staff-sub">{formatDateTime(s.startedAt)} · {s.participants} people · {s.endedAt ? "ended" : "live now"}</span>
            </li>
          {/each}
        </ul>
      {:else}<p class="quiet">Has not presented yet.</p>{/if}
    </section>
  </div>

  <section class="staff-panel history">
    <h2>Staff history</h2>
    {#if data.actions.length}
      <ul class="list">
        {#each data.actions as a, i (i)}<li><strong>{ACTIONS[a.action] ?? a.action}</strong><span class="staff-sub">{a.staff} · {formatDateTime(a.at)}{a.detail ? ` · ${a.detail}` : ""}</span></li>{/each}
      </ul>
    {:else}<p class="quiet">Nothing done by staff on this account.</p>{/if}
  </section>
{/if}

<Dialog bind:open={confirmSuspend} title="Suspend this account?" description="They are signed out everywhere, their live sessions end, and they cannot sign in until you lift it.">
  {#snippet actions()}
    <button class="btn btn-ghost" type="button" onclick={() => (confirmSuspend = false)}>Cancel</button>
    <button class="btn btn-danger" type="button" onclick={() => setSuspended(true)}>Suspend</button>
  {/snippet}
  <span></span>
</Dialog>

<style>
  .crumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 16px;
    font-size: 0.9rem;
    color: var(--ink-3);
  }

  .crumbs a {
    color: var(--ink-2);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .danger {
    color: var(--danger);
  }

  .facts {
    display: flex;
    flex-wrap: wrap;
    gap: 16px 40px;
    margin: 0 0 24px;
  }

  .facts dt {
    font-size: 0.82rem;
    color: var(--ink-3);
  }

  .facts dd {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin: 2px 0 0;
    font-weight: 600;
  }

  .suspended {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .columns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }

  .staff-panel h2 {
    margin-bottom: 12px;
    font-size: 1.15rem;
  }

  .list {
    display: grid;
    gap: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .list li {
    padding: 10px 0;
    border-top: 1px solid var(--line);
  }

  .list li:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .history {
    margin-top: 16px;
  }

  .quiet {
    color: var(--ink-3);
  }

  @media (max-width: 900px) {
    .columns {
      grid-template-columns: 1fr;
    }
  }
</style>
