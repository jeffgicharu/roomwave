<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onMount } from "svelte";

  import { signInSchema, type User } from "@roomwave/shared";

  import { post } from "#lib/api.ts";
  import PasswordField from "#lib/components/PasswordField.svelte";
  import { check, describe } from "#lib/forms.ts";
  import { safeNext, session } from "#lib/session.svelte.ts";

  let email = $state("");
  let password = $state("");
  let errors = $state<Record<string, string>>({});
  let message = $state("");
  let busy = $state(false);

  const next = $derived(safeNext(page.url.searchParams.get("next")));
  const reason = $derived(page.url.searchParams.get("reason"));

  onMount(async () => {
    // Already signed in: straight on to the app.
    const user = session.loaded ? session.user : await session.load().catch(() => null);
    if (user && !user.isGuest) await goto(next, { replace: true });
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = "";
    const valid = check(signInSchema, { email, password });
    if (!valid.ok) {
      errors = valid.errors;
      return;
    }
    errors = {};
    busy = true;
    try {
      const { user } = await post<{ user: User }>("/api/auth/signin", valid.data);
      session.set(user);
      await goto(user.role === "staff" && next === "/app" ? "/staff" : next);
    } catch (error) {
      ({ errors, message } = describe(error));
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Sign in · Roomwave</title>
</svelte:head>

<h1>Welcome back</h1>
<p class="sub">Sign in to your presentations and results.</p>

<form onsubmit={submit} novalidate>
  {#if reason === "signed_out"}
    <p class="notice notice-info form-notice">Please sign in again to continue.</p>
  {/if}
  {#if message}<p class="notice notice-error form-notice" role="alert">{message}</p>{/if}

  <div class="field">
    <label class="label" for="email">Email</label>
    <input
      id="email"
      class="input"
      type="email"
      autocomplete="email"
      inputmode="email"
      bind:value={email}
      aria-invalid={errors.email ? "true" : undefined}
      aria-describedby={errors.email ? "email-error" : undefined}
      required
    />
    {#if errors.email}<p class="field-error" id="email-error">{errors.email}</p>{/if}
  </div>

  <PasswordField id="password" label="Password" bind:value={password} error={errors.password} autocomplete="current-password" />

  <p class="forgot"><a href="/forgot-password">Forgot your password?</a></p>

  <div class="actions">
    <button class="btn btn-large btn-block" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
  </div>
</form>

<p class="alt">New to Roomwave? <a href="/signup">Create an account</a> or <a href="/try">try it without one</a>.</p>

<style>
  .forgot {
    margin-top: 12px;
    font-size: 0.92rem;
  }

  .forgot a {
    color: var(--ink-2);
  }
</style>
