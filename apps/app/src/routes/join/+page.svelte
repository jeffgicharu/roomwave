<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";

  import { parseJoinCode } from "@roomwave/shared";

  let input = $state("");
  let message = $state("");
  let busy = $state(false);
  let field: HTMLInputElement | undefined = $state();

  async function open(code: string) {
    busy = true;
    message = "";
    try {
      const response = await fetch(`/api/join/${code}`);
      if (response.ok) return void (await goto(`/${code}`));
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      message = body.message ?? "There is no session with that code. Check the code on the screen.";
    } catch {
      message = "We could not reach Roomwave. Check your connection and try again.";
    } finally {
      busy = false;
    }
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    const code = parseJoinCode(input);
    if (!code) {
      message = "A code has six digits, like 482 913.";
      field?.focus();
      return;
    }
    void open(code);
  }

  onMount(() => {
    const given = parseJoinCode(page.url.searchParams.get("code") ?? "");
    if (given) {
      input = given;
      void open(given);
    } else {
      field?.focus();
    }
  });
</script>

<svelte:head>
  <title>Join a session · Roomwave</title>
</svelte:head>

<main id="main" class="join">
  <a href="/" class="home" data-sveltekit-reload aria-label="Roomwave home">
    <svg viewBox="0 0 33 24" width="30" height="22" aria-hidden="true">
      {#each [[0, 9], [7, 15], [14, 22], [21, 15], [28, 24]] as [x, h] (x)}<rect x={x} y={24 - h!} width="5" height={h} rx="2.5" fill="var(--signal)" />{/each}
    </svg>
    <span>roomwave</span>
  </a>

  <form onsubmit={submit} novalidate>
    <h1>Join a session</h1>
    <p class="sub">Enter the code shown on the screen.</p>
    <label class="visually-hidden" for="code">Session code</label>
    <input
      id="code"
      bind:this={field}
      bind:value={input}
      inputmode="numeric"
      autocomplete="off"
      maxlength="7"
      placeholder="123 456"
      aria-invalid={message ? "true" : undefined}
      aria-describedby={message ? "code-error" : undefined}
    />
    {#if message}<p class="error" id="code-error" role="alert">{message}</p>{/if}
    <button class="btn btn-signal btn-large btn-block" type="submit" disabled={busy}>{busy ? "Checking…" : "Join"}</button>
    <p class="note">No app and no account needed. Your answers are anonymous unless you add your name.</p>
  </form>
</main>

<style>
  .join {
    display: grid;
    grid-template-rows: auto 1fr;
    min-height: 100dvh;
    padding: 20px;
    background: var(--paper);
    background-image: radial-gradient(90% 60% at 50% 0%, rgb(255 194 61 / 0.22), transparent 60%), var(--grain);
  }

  .home {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    justify-self: center;
    font-family: var(--font-display);
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.04em;
    text-decoration: none;
  }

  form {
    display: grid;
    gap: 14px;
    align-self: center;
    width: 100%;
    max-width: 400px;
    margin: 0 auto;
    padding-bottom: 12vh;
    text-align: center;
  }

  h1 {
    font-size: clamp(2rem, 8vw, 2.8rem);
  }

  .sub {
    margin-top: -6px;
    color: var(--ink-3);
  }

  input {
    width: 100%;
    min-height: 76px;
    padding: 0 16px;
    border: 2px solid var(--line-strong);
    border-radius: 18px;
    background: var(--card);
    font-family: var(--font-display);
    font-size: 2.4rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  input::placeholder {
    color: var(--paper-3);
  }

  input:focus {
    outline: none;
    border-color: var(--ink);
    box-shadow: 0 0 0 5px rgb(255 106 43 / 0.25);
  }

  input[aria-invalid="true"] {
    border-color: var(--danger);
  }

  .error {
    color: var(--danger);
    font-weight: 600;
  }

  .note {
    font-size: 0.88rem;
    color: var(--ink-3);
  }
</style>
