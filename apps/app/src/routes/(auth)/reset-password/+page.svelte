<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  import { passwordResetSchema, type User } from "@roomwave/shared";

  import { post } from "#lib/api.ts";
  import PasswordField from "#lib/components/PasswordField.svelte";
  import { check, clearEdited, describe } from "#lib/forms.ts";
  import { session } from "#lib/session.svelte.ts";
  import { toasts } from "#lib/toast.svelte.ts";

  const token = $derived(page.url.searchParams.get("token") ?? "");

  let password = $state("");
  let confirm = $state("");
  let errors = $state<Record<string, string>>({});
  let message = $state("");
  let expired = $state(false);
  let busy = $state(false);

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    message = "";
    const valid = check(passwordResetSchema, { token, password });
    const nextErrors: Record<string, string> = valid.ok ? {} : { ...valid.errors };
    if (!nextErrors.password && password !== confirm) nextErrors.confirm = "The two passwords do not match.";
    if (nextErrors.token) {
      expired = true;
      return;
    }
    if (Object.keys(nextErrors).length || !valid.ok) {
      errors = nextErrors;
      return;
    }
    errors = {};
    busy = true;
    try {
      const { user } = await post<{ user: User }>("/api/auth/reset", valid.data);
      session.set(user);
      toasts.show("Your password has been changed.");
      await goto(user.role === "staff" ? "/staff" : "/app");
    } catch (error) {
      const described = describe(error);
      if (described.message.includes("expired")) expired = true;
      ({ errors, message } = described);
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Choose a new password · Roomwave</title>
</svelte:head>

{#if expired || !token}
  <h1>This link has expired</h1>
  <p class="sub">Password links work for one hour, and only once. Ask for a new one and use it straight away.</p>
  <div class="actions">
    <a class="btn btn-large btn-block" href="/forgot-password">Send me a new link</a>
  </div>
{:else}
  <h1>Choose a new password</h1>
  <p class="sub">You will be signed in on this device, and signed out everywhere else.</p>

  <form onsubmit={submit} oninput={(event) => (errors = clearEdited(errors, event))} novalidate>
    {#if message}<p class="notice notice-error form-notice" role="alert">{message}</p>{/if}
    <PasswordField
      id="password"
      label="New password"
      bind:value={password}
      error={errors.password}
      hint="At least 10 characters."
      autocomplete="new-password"
    />
    <PasswordField id="confirm" label="Type it again" bind:value={confirm} error={errors.confirm} autocomplete="new-password" />
    <div class="actions">
      <button class="btn btn-large btn-block" type="submit" disabled={busy}>{busy ? "Saving…" : "Save and sign in"}</button>
    </div>
  </form>
{/if}
