<script lang="ts">
  import { CONTACT_TOPIC_LABELS, type StaffRequest } from "@roomwave/shared";

  import "#lib/styles/staff.css";
  import { get, post, RequestError } from "#lib/api.ts";
  import Icon from "#lib/components/Icon.svelte";
  import { formatDateTime, timeAgo } from "#lib/format.ts";
  import { toasts } from "#lib/toast.svelte.ts";

  let status = $state<"open" | "handled" | "all">("open");
  let requests = $state<StaffRequest[] | null>(null);
  let message = $state("");

  async function load() {
    try {
      ({ requests } = await get<{ requests: StaffRequest[] }>(`/api/staff/requests?status=${status}`));
      message = "";
    } catch (error) {
      message = error instanceof RequestError ? error.message : "Could not load requests.";
    }
  }

  $effect(() => {
    void status;
    requests = null;
    void load();
  });

  async function mark(request: StaffRequest, handled: boolean) {
    try {
      await post(`/api/staff/requests/${request.id}/handled`, { handled });
      toasts.show(handled ? "Marked as handled." : "Moved back to open.");
      await load();
    } catch (error) {
      toasts.show(error instanceof RequestError ? error.message : "That did not work.", "error");
    }
  }
</script>

<svelte:head>
  <title>Requests · Staff · Roomwave</title>
</svelte:head>

<header class="staff-head">
  <div>
    <h1>Requests</h1>
    <p>Messages from the contact form: sales, invoices, events and help.</p>
  </div>
  <div class="filters" role="group" aria-label="Show">
    {#each [{ id: "open", label: "Open" }, { id: "handled", label: "Handled" }, { id: "all", label: "All" }] as f (f.id)}
      <button type="button" class:on={status === f.id} aria-pressed={status === f.id} onclick={() => (status = f.id as typeof status)}>{f.label}</button>
    {/each}
  </div>
</header>

{#if message}
  <p class="notice notice-error" role="alert">{message}</p>
{:else if !requests}
  <p class="staff-empty" aria-busy="true">Loading…</p>
{:else if !requests.length}
  <p class="staff-empty">{status === "open" ? "Nothing waiting. Every request has been handled." : "No requests here."}</p>
{:else}
  <ul class="requests">
    {#each requests as r (r.id)}
      <li class="staff-panel" class:done={r.handledAt}>
        <header>
          <div>
            <span class="badge topic">{CONTACT_TOPIC_LABELS[r.topic]}</span>
            <h2>{r.name}{r.organisation ? `, ${r.organisation}` : ""}</h2>
            <span class="staff-sub" title={formatDateTime(r.createdAt)}>{r.email} · {timeAgo(r.createdAt)}</span>
          </div>
          <div class="row">
            <a class="btn btn-small btn-ghost" href={`mailto:${r.email}?subject=${encodeURIComponent("Your message to Roomwave")}`}><Icon name="mail" size={16} /> Reply</a>
            {#if r.handledAt}
              <button class="btn btn-small btn-ghost" type="button" onclick={() => mark(r, false)}>Reopen</button>
            {:else}
              <button class="btn btn-small" type="button" onclick={() => mark(r, true)}><Icon name="check" size={16} /> Handled</button>
            {/if}
          </div>
        </header>
        <p class="message">{r.message}</p>
        {#if r.handledAt}<p class="staff-sub">Handled by {r.handledBy ?? "staff"} {timeAgo(r.handledAt)}</p>{/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .filters {
    display: flex;
    gap: 6px;
  }

  .filters button {
    min-height: 36px;
    padding: 0 14px;
    border: 1.5px solid var(--line-strong);
    border-radius: 999px;
    background: transparent;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--ink-2);
    cursor: pointer;
  }

  .filters button.on {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
  }

  .requests {
    display: grid;
    gap: 12px;
    max-width: 920px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .requests header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .requests h2 {
    margin: 8px 0 2px;
    font-size: 1.15rem;
  }

  .topic {
    background: var(--signal-soft);
    color: var(--signal-strong);
  }

  .row {
    display: flex;
    gap: 6px;
  }

  .message {
    margin: 14px 0 8px;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }

  .done {
    opacity: 0.75;
  }
</style>
