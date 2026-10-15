<script lang="ts">
  import { onMount } from "svelte";

  import { formatJoinCode, type StaffLiveSession } from "@roomwave/shared";

  import "#lib/styles/staff.css";
  import { get, post, RequestError } from "#lib/api.ts";
  import Dialog from "#lib/components/Dialog.svelte";
  import { timeAgo } from "#lib/format.ts";
  import { toasts } from "#lib/toast.svelte.ts";

  let sessions = $state<StaffLiveSession[] | null>(null);
  let message = $state("");
  let ending = $state<StaffLiveSession | null>(null);
  let confirmOpen = $state(false);

  async function load() {
    try {
      ({ sessions } = await get<{ sessions: StaffLiveSession[] }>("/api/staff/sessions"));
      message = "";
    } catch (error) {
      message = error instanceof RequestError ? error.message : "Could not load live sessions.";
    }
  }

  onMount(() => {
    void load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  });

  async function end() {
    const target = ending;
    confirmOpen = false;
    if (!target) return;
    try {
      await post(`/api/staff/sessions/${target.id}/end`);
      toasts.show(`Ended “${target.title}”.`);
      await load();
    } catch (error) {
      toasts.show(error instanceof RequestError ? error.message : "Could not end it.", "error");
    }
  }
</script>

<svelte:head>
  <title>Live sessions · Staff · Roomwave</title>
</svelte:head>

<header class="staff-head">
  <div>
    <h1>Live sessions</h1>
    <p>Sessions running now. Updated every 10 seconds.</p>
  </div>
</header>

{#if message}
  <p class="notice notice-error" role="alert">{message}</p>
{:else if !sessions}
  <p class="staff-empty" aria-busy="true">Loading…</p>
{:else if !sessions.length}
  <p class="staff-empty">Nobody is presenting right now.</p>
{:else}
  <div class="staff-table-wrap">
    <table class="staff-table">
      <thead>
        <tr>
          <th scope="col">Session</th>
          <th scope="col">Presenter</th>
          <th scope="col">Started</th>
          <th scope="col" class="num">Online</th>
          <th scope="col" class="num">Joined</th>
          <th scope="col" class="num">Answers</th>
          <th scope="col"><span class="visually-hidden">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {#each sessions as s (s.id)}
          <tr>
            <td><strong>{s.title}</strong><span class="staff-sub">Code {formatJoinCode(s.code)}</span></td>
            <td><a href={`/staff/customers/${s.ownerId}`}>{s.owner}</a></td>
            <td>{timeAgo(s.startedAt)}</td>
            <td class="num"><span class="online">{s.online}</span></td>
            <td class="num">{s.participants}</td>
            <td class="num">{s.responses}</td>
            <td class="num">
              <button class="btn btn-small btn-ghost danger" type="button" onclick={() => { ending = s; confirmOpen = true; }}>End</button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<Dialog bind:open={confirmOpen} title="End this session?" description={ending ? `“${ending.title}” ends for its presenter and everyone in the room. Use this for abuse, not by mistake.` : ""}>
  {#snippet actions()}
    <button class="btn btn-ghost" type="button" onclick={() => (confirmOpen = false)}>Cancel</button>
    <button class="btn btn-danger" type="button" onclick={end}>End the session</button>
  {/snippet}
  <span></span>
</Dialog>

<style>
  .online {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-weight: 700;
  }

  .online::before {
    content: "";
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
  }

  .danger {
    color: var(--danger);
  }
</style>
