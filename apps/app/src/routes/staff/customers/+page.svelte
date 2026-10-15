<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  import { PLANS, type StaffCustomer } from "@roomwave/shared";

  import "#lib/styles/staff.css";
  import { get, RequestError } from "#lib/api.ts";
  import Icon from "#lib/components/Icon.svelte";
  import { formatDate, timeAgo } from "#lib/format.ts";

  const FILTERS = [
    { id: "all", label: "Everyone" },
    { id: "free", label: "Free" },
    { id: "trial", label: "On trial" },
    { id: "paid", label: "Paying" },
    { id: "guest", label: "Guests" },
    { id: "suspended", label: "Suspended" },
  ];

  let customers = $state<StaffCustomer[] | null>(null);
  let total = $state(0);
  let pageSize = $state(25);
  let message = $state("");
  let search = $state(page.url.searchParams.get("q") ?? "");

  const plan = $derived(page.url.searchParams.get("plan") ?? "all");
  const pageNumber = $derived(Math.max(1, Number(page.url.searchParams.get("page")) || 1));
  const query = $derived(page.url.searchParams.get("q") ?? "");
  const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));

  $effect(() => {
    const params = new URLSearchParams({ plan, page: String(pageNumber), q: query });
    customers = null;
    get<{ customers: StaffCustomer[]; total: number; pageSize: number }>(`/api/staff/customers?${params}`)
      .then((data) => {
        customers = data.customers;
        total = data.total;
        pageSize = data.pageSize;
        message = "";
      })
      .catch((error) => (message = error instanceof RequestError ? error.message : "Could not load customers."));
  });

  function go(next: { plan?: string; page?: number; q?: string }) {
    const params = new URLSearchParams();
    const p = next.plan ?? plan;
    const q = next.q ?? query;
    if (p !== "all") params.set("plan", p);
    if (q) params.set("q", q);
    if ((next.page ?? 1) > 1) params.set("page", String(next.page));
    void goto(`/staff/customers${params.size ? `?${params}` : ""}`, { reset: false });
  }

  function submitSearch(event: SubmitEvent) {
    event.preventDefault();
    go({ q: search.trim(), page: 1 });
  }
</script>

<svelte:head>
  <title>Customers · Staff · Roomwave</title>
</svelte:head>

<header class="staff-head">
  <div>
    <h1>Customers</h1>
    <p>{total.toLocaleString("en-KE")} {plan === "all" ? "accounts and guest workspaces" : "matching"}</p>
  </div>
  <form class="search" role="search" onsubmit={submitSearch}>
    <label class="visually-hidden" for="search">Search customers</label>
    <Icon name="search" size={18} />
    <input id="search" class="input" type="search" bind:value={search} placeholder="Name, email or organisation" />
  </form>
</header>

<div class="filters" role="group" aria-label="Filter by plan">
  {#each FILTERS as filter (filter.id)}
    <button type="button" class:on={plan === filter.id} aria-pressed={plan === filter.id} onclick={() => go({ plan: filter.id, page: 1 })}>{filter.label}</button>
  {/each}
</div>

{#if message}
  <p class="notice notice-error" role="alert">{message}</p>
{:else if !customers}
  <p class="staff-empty" aria-busy="true">Loading…</p>
{:else if !customers.length}
  <p class="staff-empty">No customers match{query ? ` “${query}”` : ""}.</p>
{:else}
  <div class="staff-table-wrap">
    <table class="staff-table">
      <thead>
        <tr>
          <th scope="col">Customer</th>
          <th scope="col">Plan</th>
          <th scope="col" class="num">Presentations</th>
          <th scope="col" class="num">Sessions</th>
          <th scope="col">Last active</th>
          <th scope="col">Joined</th>
        </tr>
      </thead>
      <tbody>
        {#each customers as c (c.id)}
          <tr>
            <td>
              <a class="who" href={`/staff/customers/${c.id}`}>{c.isGuest ? "Guest workspace" : c.name}</a>
              <span class="staff-sub">{c.email ?? "No email yet"}{c.organisation ? ` · ${c.organisation}` : ""}</span>
            </td>
            <td>
              {#if c.suspended}<span class="badge suspended">Suspended</span>
              {:else if c.isGuest}<span class="badge">Guest</span>
              {:else if c.onTrial}<span class="badge badge-trial">Pro trial</span>
              {:else if c.plan !== "free"}<span class="badge badge-pro">{PLANS[c.plan].name}</span>
              {:else}<span class="badge">Free</span>{/if}
            </td>
            <td class="num">{c.presentations}</td>
            <td class="num">{c.sessions}</td>
            <td>{c.lastActiveAt ? timeAgo(c.lastActiveAt) : "Never"}</td>
            <td>{formatDate(c.createdAt)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  {#if pages > 1}
    <nav class="pager" aria-label="Pages">
      <button type="button" class="btn btn-small btn-ghost" disabled={pageNumber <= 1} onclick={() => go({ page: pageNumber - 1 })}><Icon name="chevron-left" size={16} /> Newer</button>
      <span>Page {pageNumber} of {pages}</span>
      <button type="button" class="btn btn-small btn-ghost" disabled={pageNumber >= pages} onclick={() => go({ page: pageNumber + 1 })}>Older <Icon name="chevron-right" size={16} /></button>
    </nav>
  {/if}
{/if}

<style>
  .search {
    position: relative;
    width: min(340px, 100%);
  }

  .search :global(svg) {
    position: absolute;
    top: 50%;
    left: 12px;
    color: var(--ink-3);
    transform: translateY(-50%);
  }

  .search .input {
    padding-left: 40px;
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
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

  .who {
    font-weight: 600;
    text-decoration: none;
  }

  .who:hover {
    text-decoration: underline;
  }

  .suspended {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .pager {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-top: 16px;
    font-size: 0.9rem;
    color: var(--ink-3);
  }
</style>
