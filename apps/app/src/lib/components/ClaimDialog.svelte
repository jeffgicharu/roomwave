<script lang="ts">
  import { signUpSchema, type User } from "@roomwave/shared";

  import { post } from "../api.ts";
  import { check, clearEdited, describe } from "../forms.ts";
  import { session } from "../session.svelte.ts";
  import { toasts } from "../toast.svelte.ts";
  import Dialog from "./Dialog.svelte";
  import PasswordField from "./PasswordField.svelte";

  let { open = $bindable(false) }: { open: boolean } = $props();

  let name = $state("");
  let email = $state("");
  let password = $state("");
  let errors = $state<Record<string, string>>({});
  let message = $state("");
  let busy = $state(false);

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
      const { user } = await post<{ user: User }>("/api/auth/claim", valid.data);
      session.set(user);
      open = false;
      toasts.show("Saved. Your presentations now belong to your account.");
    } catch (error) {
      ({ errors, message } = describe(error));
    } finally {
      busy = false;
    }
  }
</script>

<Dialog bind:open title="Keep your workspace" description="Add your name, email and a password. Everything you made as a guest stays.">
  <form id="claim-form" onsubmit={submit} oninput={(event) => (errors = clearEdited(errors, event))} novalidate>
    {#if message}<p class="notice notice-error" role="alert">{message}</p>{/if}
    <div class="field">
      <label class="label" for="claim-name">Your name</label>
      <input id="claim-name" class="input" autocomplete="name" bind:value={name} aria-invalid={errors.name ? "true" : undefined} />
      {#if errors.name}<p class="field-error">{errors.name}</p>{/if}
    </div>
    <div class="field">
      <label class="label" for="claim-email">Email</label>
      <input
        id="claim-email"
        class="input"
        type="email"
        autocomplete="email"
        inputmode="email"
        bind:value={email}
        aria-invalid={errors.email ? "true" : undefined}
      />
      {#if errors.email}<p class="field-error">{errors.email}</p>{/if}
    </div>
    <PasswordField id="claim-password" label="Password" bind:value={password} error={errors.password} hint="At least 10 characters." autocomplete="new-password" />
  </form>
  {#snippet actions()}
    <button class="btn btn-ghost" type="button" onclick={() => (open = false)}>Not now</button>
    <button class="btn btn-signal" type="submit" form="claim-form" disabled={busy}>{busy ? "Saving…" : "Create account"}</button>
  {/snippet}
</Dialog>

<style>
  .notice {
    margin-bottom: 16px;
  }
</style>
