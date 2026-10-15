<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  import type { User } from "@roomwave/shared";
  import { Logo, Mark } from "@roomwave/ui";

  import { post } from "#lib/api.ts";
  import { describe } from "#lib/forms.ts";
  import { session } from "#lib/session.svelte.ts";

  let message = $state("");

  // Signs this browser in to the staff training account and opens the console.
  async function start() {
    message = "";
    try {
      const { user } = await post<{ user: User }>("/api/auth/training");
      session.set(user);
      await goto("/staff", { replace: true });
    } catch (error) {
      message = describe(error).message || "We could not open the staff console. Please try again.";
    }
  }

  onMount(start);
</script>

<svelte:head>
  <title>Staff console · Roomwave</title>
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
      <h1>Opening the staff console</h1>
      <p>You are signing in to the training account, which works on sample customers only.</p>
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
