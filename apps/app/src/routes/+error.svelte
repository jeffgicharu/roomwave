<script lang="ts">
  import { page } from "$app/state";
  import { Logo } from "@roomwave/ui";

  const missing = $derived(page.status === 404);
</script>

<svelte:head>
  <title>{missing ? "Page not found" : "Something went wrong"} · Roomwave</title>
</svelte:head>

<main id="main" class="lost">
  <a class="home" href="/" data-sveltekit-reload aria-label="Roomwave home"><Logo size={24} /></a>
  <div class="inner">
    <p class="code" aria-hidden="true">{page.status}</p>
    {#if missing}
      <h1>Nobody answered at this address.</h1>
      <p class="lead">The page may have moved, or the link may have a typing mistake.</p>
    {:else}
      <h1>Something went wrong on our side.</h1>
      <p class="lead">Reload the page to try again. If it keeps happening, tell us what you were doing.</p>
    {/if}
    <div class="links">
      {#if missing}
        <a class="btn btn-signal" href="/" data-sveltekit-reload>Go to the home page</a>
      {:else}
        <button class="btn btn-signal" type="button" onclick={() => location.reload()}>Reload the page</button>
      {/if}
      <a class="btn btn-ghost" href="/join">Join a session</a>
      <a class="btn btn-ghost" href="/app">Your presentations</a>
    </div>
  </div>
</main>

<style>
  .lost {
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 100dvh;
    padding: 24px var(--gutter);
  }

  .home {
    justify-self: start;
    display: inline-flex;
    color: var(--ink);
  }

  .inner {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 18px;
    padding-bottom: 10vh;
    text-align: center;
  }

  .code {
    font-family: var(--font-display);
    font-size: clamp(5rem, 3rem + 10vw, 11rem);
    font-weight: 800;
    line-height: 0.9;
    letter-spacing: -0.06em;
    color: var(--signal-strong);
  }

  h1 {
    max-width: 22ch;
    font-size: clamp(1.8rem, 1.2rem + 2.4vw, 2.8rem);
    line-height: 1.08;
    letter-spacing: -0.03em;
  }

  .lead {
    max-width: 46ch;
    color: var(--ink-2);
    font-size: 1.1rem;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 10px;
    margin-top: 8px;
  }
</style>
