<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";

  import type { User } from "@roomwave/shared";
  import { Logo, Mark } from "@roomwave/ui";

  import { post } from "#lib/api.ts";
  import { describe } from "#lib/forms.ts";
  import { session } from "#lib/session.svelte.ts";

  let message = $state("");

  async function start() {
    message = "";
    try {
      const template = page.url.searchParams.get("template");
      const existing = session.loaded ? session.user : await session.load().catch(() => null);
      // Someone with an account gets the template among their own presentations.
      if (existing && !existing.isGuest) {
        if (template) {
          const { id } = await post<{ id: string }>("/api/presentations", { template });
          return goto(`/app/presentations/${id}`, { replace: true });
        }
        return goto("/app", { replace: true });
      }
      const { user } = await post<{ user: User }>("/api/guest", template ? { template } : {});
      session.set(user);
      await goto("/app?welcome=guest", { replace: true });
    } catch (error) {
      message = describe(error).message || "We could not set up your workspace. Please try again.";
    }
  }

  onMount(start);
</script>

<svelte:head>
  <title>Try Roomwave · Roomwave</title>
</svelte:head>

<main id="main" class="try">
  <a href="/" data-sveltekit-reload class="home" aria-label="Roomwave home"><Logo size={24} /></a>
  <div class="card">
    {#if message}
      <h1>That did not work</h1>
      <p role="alert">{message}</p>
      <button class="btn btn-signal" type="button" onclick={start}>Try again</button>
    {:else}
      <Mark size={56} live />
      <h1>Setting up your workspace</h1>
      <p>A sample presentation is on its way, with one of every kind of question.</p>
    {/if}
  </div>
</main>

<style>
  .try {
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 100dvh;
    padding: 28px clamp(20px, 5vw, 64px);
    background: var(--paper);
    background-image: var(--grain);
  }

  .home {
    text-decoration: none;
  }

  .card {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: 16px;
    max-width: 440px;
    margin: 0 auto;
    text-align: center;
  }

  h1 {
    font-size: var(--step-3);
  }

  p {
    color: var(--ink-3);
  }
</style>
