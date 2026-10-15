<script lang="ts">
  import { page } from "$app/state";

  import { Logo } from "@roomwave/ui";

  import { post } from "#lib/api.ts";
  import ClaimDialog from "#lib/components/ClaimDialog.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import Menu from "#lib/components/Menu.svelte";
  import { daysLeft, timeAgo } from "#lib/format.ts";
  import { session } from "#lib/session.svelte.ts";

  let { children } = $props();
  let claiming = $state(false);

  const user = $derived(session.user!);
  const links = $derived([
    { href: "/app", label: "Presentations", active: page.url.pathname === "/app" || page.url.pathname.startsWith("/app/presentations") },
    { href: "/app/billing", label: "Plan", active: page.url.pathname.startsWith("/app/billing") },
    { href: "/app/account", label: "Account", active: page.url.pathname.startsWith("/app/account") },
  ]);

  async function signOut() {
    await post("/api/auth/signout").catch(() => {});
    session.set(null);
    location.href = "/";
  }
</script>

<div class="shell">
  {#if user.isGuest}
    <div class="guest-bar">
      <p>
        <strong>You are trying Roomwave as a guest.</strong>
        This workspace is deleted {user.guestExpiresAt ? timeAgo(user.guestExpiresAt) : "tomorrow"}.
      </p>
      <button class="btn btn-small btn-signal" type="button" onclick={() => (claiming = true)}>Keep it: create an account</button>
    </div>
  {/if}

  <header class="top">
    <div class="container bar">
      <a href="/app" class="logo" aria-label="Your presentations"><Logo size={22} /></a>
      <nav aria-label="Main">
        {#each links as link (link.href)}
          <a href={link.href} class:active={link.active} aria-current={link.active ? "page" : undefined}>{link.label}</a>
        {/each}
        {#if user.role === "staff"}<a href="/staff">Staff</a>{/if}
      </nav>
      <div class="right">
        {#if user.plan.onTrial}
          <a class="badge badge-trial plan-badge" href="/app/billing">Pro trial · {daysLeft(user.plan.trialEndsAt!)} days left</a>
        {:else if user.plan.plan !== "free"}
          <span class="badge badge-pro plan-badge">{user.plan.plan === "pro" ? "Pro" : "Organisation"}</span>
        {/if}
        <Menu label="Your account">
          {#snippet trigger()}
            <span class="avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>
            <Icon name="chevron-down" size={16} />
          {/snippet}
          {#snippet children(close)}
            <div class="who">
              <strong>{user.name}</strong>
              <span>{user.email ?? "Guest workspace"}</span>
            </div>
            <hr />
            <a href="/app" class="only-small" onclick={close}><Icon name="home" size={18} /> Presentations</a>
            <a href="/app/billing" class="only-small" onclick={close}><Icon name="card" size={18} /> Plan</a>
            <a href="/app/account" onclick={close}><Icon name="user" size={18} /> Account</a>
            {#if user.role === "staff"}<a href="/staff" onclick={close}><Icon name="flag" size={18} /> Staff console</a>{/if}
            <hr />
            <button type="button" onclick={signOut}><Icon name="logout" size={18} /> Sign out</button>
          {/snippet}
        </Menu>
      </div>
    </div>
  </header>

  <main id="main" class="container main">
    {@render children()}
  </main>
</div>

<ClaimDialog bind:open={claiming} />

<style>
  .shell {
    min-height: 100dvh;
    background: var(--paper);
  }

  .guest-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 10px 16px;
    padding: 10px var(--gutter);
    background: var(--ink);
    color: var(--paper);
    font-size: 0.92rem;
    text-align: center;
  }

  .top {
    position: sticky;
    top: 0;
    z-index: 30;
    background: rgb(251 247 240 / 0.88);
    backdrop-filter: saturate(1.4) blur(12px);
    border-bottom: 1px solid var(--line);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 28px;
    min-height: 64px;
  }

  .logo {
    text-decoration: none;
  }

  nav {
    display: flex;
    gap: 4px;
  }

  nav a {
    padding: 8px 12px;
    border-radius: var(--radius-pill);
    color: var(--ink-2);
    font-weight: 500;
    text-decoration: none;
  }

  nav a:hover {
    background: var(--paper-2);
    color: var(--ink);
  }

  nav a.active {
    background: var(--ink);
    color: var(--paper);
  }

  .right {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-left: auto;
  }

  .plan-badge {
    text-decoration: none;
  }

  .right :global(.menu-button) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px 4px 4px;
    border: 1px solid var(--line);
    border-radius: var(--radius-pill);
    background: var(--card);
    color: var(--ink-2);
    cursor: pointer;
  }

  .avatar {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--signal);
    color: var(--ink);
    font-family: var(--font-display);
    font-weight: 700;
  }

  .who {
    display: grid;
    gap: 2px;
    padding: 8px 10px 6px;
    min-width: 0;
  }

  .who span {
    font-size: 0.85rem;
    color: var(--ink-3);
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .main {
    padding-top: clamp(24px, 4vw, 44px);
    padding-bottom: 80px;
  }

  :global(.only-small) {
    display: none !important;
  }

  @media (max-width: 720px) {
    nav {
      display: none;
    }

    .bar {
      gap: 12px;
    }

    :global(.only-small) {
      display: flex !important;
    }
  }

  @media (max-width: 420px) {
    .plan-badge {
      display: none;
    }
  }
</style>
