<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";

  import { Mark } from "@roomwave/ui";

  import { session } from "#lib/session.svelte.ts";

  let { children } = $props();
  let ready = $state(false);
  let failed = $state(false);

  onMount(async () => {
    try {
      const user = session.loaded && session.user ? session.user : await session.load();
      if (!user) {
        const next = page.url.pathname + page.url.search;
        await goto(`/signin?next=${encodeURIComponent(next)}`, { replace: true });
        return;
      }
      ready = true;
    } catch {
      failed = true;
    }
  });
</script>

{#if ready}
  {@render children()}
{:else if failed}
  <main id="main" class="waiting">
    <p>We could not reach Roomwave. Check your connection and reload the page.</p>
    <button class="btn" type="button" onclick={() => location.reload()}>Reload</button>
  </main>
{:else}
  <main id="main" class="waiting" aria-busy="true"><Mark size={40} live title="Loading" /></main>
{/if}

<style>
  .waiting {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 16px;
    min-height: 100dvh;
    padding: 24px;
    text-align: center;
    color: var(--ink-3);
  }
</style>
