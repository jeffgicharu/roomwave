<script lang="ts">
  import { forgotSchema } from "@roomwave/shared";

  import { post } from "#lib/api.ts";
  import { check, clearEdited, describe } from "#lib/forms.ts";

  let email = $state("");
  let errors = $state<Record<string, string>>({});
  let message = $state("");
  let busy = $state(false);
  let sentTo = $state<string | null>(null);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = "";
    const valid = check(forgotSchema, { email });
    if (!valid.ok) {
      errors = valid.errors;
      return;
    }
    errors = {};
    busy = true;
    try {
      await post("/api/auth/forgot", valid.data);
      sentTo = valid.data.email;
    } catch (error) {
      ({ errors, message } = describe(error));
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Reset your password · Roomwave</title>
</svelte:head>

{#if sentTo}
  <h1>Check your email</h1>
  <p class="sub">
    If an account uses <strong>{sentTo}</strong>, we have sent it a link to choose a new password. The link works for
    one hour.
  </p>
  <div class="actions">
    <a class="btn btn-ghost btn-block" href="/signin">Back to sign in</a>
    <button class="link-button" type="button" onclick={() => (sentTo = null)}>Use a different email</button>
  </div>
{:else}
  <h1>Forgot your password?</h1>
  <p class="sub">Enter the email you signed up with and we will send you a link to choose a new one.</p>

  <form onsubmit={submit} oninput={(event) => (errors = clearEdited(errors, event))} novalidate>
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
    <div class="actions">
      <button class="btn btn-large btn-block" type="submit" disabled={busy}>{busy ? "Sending…" : "Send the link"}</button>
    </div>
  </form>

  <p class="alt">Remembered it? <a href="/signin">Sign in</a></p>
{/if}
