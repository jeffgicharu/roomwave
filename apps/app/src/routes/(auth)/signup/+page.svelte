<script lang="ts">
  import { goto } from "$app/navigation";
  import { onMount } from "svelte";

  import { signUpSchema, type User } from "@roomwave/shared";

  import { post } from "#lib/api.ts";
  import PasswordField from "#lib/components/PasswordField.svelte";
  import { check, describe } from "#lib/forms.ts";
  import { session } from "#lib/session.svelte.ts";

  let name = $state("");
  let email = $state("");
  let password = $state("");
  let errors = $state<Record<string, string>>({});
  let message = $state("");
  let busy = $state(false);

  onMount(async () => {
    const user = session.loaded ? session.user : await session.load().catch(() => null);
    if (user && !user.isGuest) await goto("/app", { replace: true });
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = "";
    const valid = check(signUpSchema, { name, email, password });
    if (!valid.ok) {
      errors = valid.errors;
      return;
    }
    errors = {};
    busy = true;
    try {
      const { user } = await post<{ user: User }>("/api/auth/signup", valid.data);
      session.set(user);
      await goto("/app?welcome=1");
    } catch (error) {
      ({ errors, message } = describe(error));
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Create your account · Roomwave</title>
</svelte:head>

<h1>Create your account</h1>
<p class="sub">Free for rooms of up to 50 people. No card, no app for your audience.</p>

<form onsubmit={submit} novalidate>
  {#if message}<p class="notice notice-error form-notice" role="alert">{message}</p>{/if}

  <div class="field">
    <label class="label" for="name">Your name</label>
    <input
      id="name"
      class="input"
      autocomplete="name"
      bind:value={name}
      aria-invalid={errors.name ? "true" : undefined}
      aria-describedby={errors.name ? "name-error" : undefined}
      required
    />
    {#if errors.name}<p class="field-error" id="name-error">{errors.name}</p>{/if}
  </div>

  <div class="field">
    <label class="label" for="email">Work email</label>
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

  <PasswordField
    id="password"
    label="Password"
    bind:value={password}
    error={errors.password}
    hint="At least 10 characters."
    autocomplete="new-password"
  />

  <div class="actions">
    <button class="btn btn-signal btn-large btn-block" type="submit" disabled={busy}>
      {busy ? "Creating your account…" : "Create account"}
    </button>
    <p class="terms">
      By creating an account you agree to our <a href="/terms" data-sveltekit-reload>terms</a> and
      <a href="/privacy" data-sveltekit-reload>privacy policy</a>.
    </p>
  </div>
</form>

<p class="alt">Already have an account? <a href="/signin">Sign in</a></p>

<style>
  .terms {
    font-size: 0.85rem;
    color: var(--ink-3);
    text-align: center;
  }

  .terms a {
    color: inherit;
  }
</style>
