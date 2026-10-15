<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";

  import { Logo, Mark } from "@roomwave/ui";

  import { post } from "#lib/api.ts";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";
  import { session } from "#lib/session.svelte.ts";

  let { children } = $props();
  let ready = $state(false);
  let denied = $state(false);

  const links: { href: string; label: string; icon: IconName }[] = [
    { href: "/staff", label: "Overview", icon: "home" },
    { href: "/staff/customers", label: "Customers", icon: "users" },
    { href: "/staff/sessions", label: "Live sessions", icon: "play" },
    { href: "/staff/requests", label: "Requests", icon: "inbox" },
    { href: "/staff/health", label: "System health", icon: "pulse" },
  ];

  const isActive = (href: string) =>
    href === "/staff" ? page.url.pathname === "/staff" : page.url.pathname.startsWith(href);

  onMount(async () => {
    const user = session.loaded && session.user ? session.user : await session.load().catch(() => null);
    if (!user) {
      await goto(`/signin?next=${encodeURIComponent(page.url.pathname)}`, { replace: true });
      return;
    }
    if (user.role !== "staff") denied = true;
    else ready = true;
  });

  async function signOut() {
    await post("/api/auth/signout").catch(() => {});
    session.set(null);
    location.href = "/signin";
  }
</script>

{#if denied}
  <main id="main" class="message">
    <h1>Staff only</h1>
    <p>This part of Roomwave is for the Roomwave team.</p>
    <a class="btn" href="/app">Go to your presentations</a>
  </main>
{:else if !ready}
  <main id="main" class="message" aria-busy="true"><Mark size={40} live title="Loading" /></main>
{:else}
  <div class="console">
    <aside class="side">
      <a class="brand" href="/staff" aria-label="Staff overview"><Logo size={20} tone="paper" /><span class="tag">Staff</span></a>
      <nav aria-label="Staff">
        {#each links as link (link.href)}
          <a href={link.href} class:active={isActive(link.href)} aria-current={isActive(link.href) ? "page" : undefined}>
            <Icon name={link.icon} size={18} />
            <span>{link.label}</span>
          </a>
        {/each}
      </nav>
      {#if session.user?.isSample}
        <p class="training"><strong>Training account</strong> Sample customers only. Changes are undone each night.</p>
      {/if}
      <div class="who">
        <span class="avatar" aria-hidden="true">{session.user?.name.slice(0, 1)}</span>
        <span class="name">{session.user?.name}</span>
        <button type="button" class="signout" aria-label="Sign out" title="Sign out" onclick={signOut}><Icon name="logout" size={18} /></button>
      </div>
    </aside>
    <main id="main" class="content">
      {@render children()}
    </main>
  </div>
{/if}

<style>
  .message {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 14px;
    min-height: 100dvh;
    padding: 24px;
    text-align: center;
  }

  .message p {
    color: var(--ink-3);
  }

  .console {
    display: grid;
    grid-template-columns: 248px minmax(0, 1fr);
    min-height: 100dvh;
    background: var(--paper);
  }

  .side {
    position: sticky;
    top: 0;
    display: grid;
    grid-template-rows: auto 1fr auto auto;
    gap: 24px;
    height: 100dvh;
    padding: 22px 14px;
    background: var(--stage);
    background-image: radial-gradient(120% 40% at 0% 0%, rgb(255 122 61 / 0.18), transparent 70%);
    color: var(--stage-text);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px;
    text-decoration: none;
  }

  .training {
    display: grid;
    gap: 2px;
    margin: 0 4px;
    padding: 12px 14px;
    border-radius: var(--radius-m);
    background: rgb(255 194 61 / 0.12);
    border: 1px solid rgb(255 194 61 / 0.3);
    font-size: 0.82rem;
    line-height: 1.4;
    color: var(--stage-muted);
  }

  .training strong {
    color: var(--sun);
    font-weight: 700;
  }

  .tag {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--stage-3);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--stage-muted);
  }

  nav {
    display: grid;
    align-content: start;
    gap: 2px;
  }

  nav a {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 42px;
    padding: 0 12px;
    border-radius: 10px;
    color: var(--stage-muted);
    font-weight: 500;
    text-decoration: none;
  }

  nav a:hover {
    background: var(--stage-2);
    color: var(--stage-text);
  }

  nav a.active {
    background: var(--stage-3);
    color: var(--stage-text);
    box-shadow: inset 3px 0 0 var(--signal);
  }

  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 8px 0;
    border-top: 1px solid var(--stage-line);
  }

  .avatar {
    display: grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: var(--signal);
    color: var(--ink);
    font-weight: 700;
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.92rem;
  }

  .signout {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--stage-muted);
    cursor: pointer;
  }

  .signout:hover {
    background: var(--stage-2);
    color: var(--stage-text);
  }

  .content {
    min-width: 0;
    padding: clamp(20px, 3vw, 40px);
  }

  @media (max-width: 860px) {
    .console {
      grid-template-columns: 1fr;
    }

    .side {
      position: static;
      grid-template-rows: auto auto;
      grid-template-columns: 1fr auto;
      height: auto;
      gap: 12px;
      padding: 14px 16px 10px;
    }

    nav {
      grid-column: 1 / -1;
      grid-row: 2;
      display: flex;
      gap: 4px;
      margin: 0 -16px;
      padding: 0 16px 4px;
      overflow-x: auto;
      scrollbar-width: none;
    }

    nav a {
      flex: none;
      min-height: 38px;
      font-size: 0.9rem;
    }

    nav a.active {
      box-shadow: inset 0 -3px 0 var(--signal);
    }

    .who {
      grid-column: 2;
      grid-row: 1;
      padding: 0;
      border: 0;
    }

    .name {
      display: none;
    }

    .training {
      grid-column: 1 / -1;
      grid-row: 3;
      margin: 0;
    }
  }
</style>
