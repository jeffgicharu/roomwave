<script lang="ts">
  import { accountUpdateSchema, passwordChangeSchema, type User } from "@roomwave/shared";

  import { del, patch, post } from "#lib/api.ts";
  import ClaimDialog from "#lib/components/ClaimDialog.svelte";
  import Dialog from "#lib/components/Dialog.svelte";
  import PasswordField from "#lib/components/PasswordField.svelte";
  import { formatDate } from "#lib/format.ts";
  import { check, clearEdited, describe } from "#lib/forms.ts";
  import { session } from "#lib/session.svelte.ts";
  import { toasts } from "#lib/toast.svelte.ts";

  const user = $derived(session.user!);

  let name = $state(session.user?.name ?? "");
  let email = $state(session.user?.email ?? "");
  let profileErrors = $state<Record<string, string>>({});
  let profileMessage = $state("");
  let savingProfile = $state(false);

  let current = $state("");
  let next = $state("");
  let passwordErrors = $state<Record<string, string>>({});
  let passwordMessage = $state("");
  let savingPassword = $state(false);

  let deleting = $state(false);
  let deletePassword = $state("");
  let deleteError = $state("");
  let claiming = $state(false);

  async function saveProfile(event: SubmitEvent) {
    event.preventDefault();
    profileMessage = "";
    const valid = check(accountUpdateSchema, { name, email });
    if (!valid.ok) return void (profileErrors = valid.errors);
    profileErrors = {};
    savingProfile = true;
    try {
      const { user: updated } = await patch<{ user: User }>("/api/account", valid.data);
      session.set(updated);
      toasts.show("Your details are saved.");
    } catch (error) {
      ({ errors: profileErrors, message: profileMessage } = describe(error));
    } finally {
      savingProfile = false;
    }
  }

  async function savePassword(event: SubmitEvent) {
    event.preventDefault();
    passwordMessage = "";
    const valid = check(passwordChangeSchema, { current, next });
    if (!valid.ok) return void (passwordErrors = valid.errors);
    passwordErrors = {};
    savingPassword = true;
    try {
      await post("/api/account/password", valid.data);
      current = "";
      next = "";
      toasts.show("Password changed. Other devices have been signed out.");
    } catch (error) {
      ({ errors: passwordErrors, message: passwordMessage } = describe(error));
    } finally {
      savingPassword = false;
    }
  }

  async function deleteAccount(event: SubmitEvent) {
    event.preventDefault();
    deleteError = "";
    try {
      await del("/api/account", { password: deletePassword });
      session.set(null);
      location.href = "/";
    } catch (error) {
      const described = describe(error);
      deleteError = described.errors.password ?? described.message;
    }
  }
</script>

<svelte:head>
  <title>Account · Roomwave</title>
</svelte:head>

<h1>Account</h1>
<p class="sub">
  {#if user.isGuest}
    You are using a guest workspace.
  {:else}
    Member since {formatDate(user.createdAt)}.
  {/if}
</p>

<div class="sections">
  {#if user.isGuest}
    <section class="panel highlight">
      <div>
        <h2>Keep your work</h2>
        <p>Guest workspaces are deleted after a day. Add an email address and a password to keep your presentations and results.</p>
      </div>
      <button class="btn btn-signal" type="button" onclick={() => (claiming = true)}>Create an account</button>
    </section>
  {:else}
    <section class="panel">
      <div class="intro">
        <h2>Your details</h2>
        <p>The name and email on your account. Reports are sent to this email.</p>
      </div>
      <form onsubmit={saveProfile} oninput={(event) => (profileErrors = clearEdited(profileErrors, event))} novalidate>
        {#if profileMessage}<p class="notice notice-error" role="alert">{profileMessage}</p>{/if}
        <div class="field">
          <label class="label" for="name">Name</label>
          <input id="name" class="input" autocomplete="name" bind:value={name} aria-invalid={profileErrors.name ? "true" : undefined} />
          {#if profileErrors.name}<p class="field-error">{profileErrors.name}</p>{/if}
        </div>
        <div class="field">
          <label class="label" for="email">Email</label>
          <input id="email" class="input" type="email" autocomplete="email" bind:value={email} aria-invalid={profileErrors.email ? "true" : undefined} />
          {#if profileErrors.email}<p class="field-error">{profileErrors.email}</p>{/if}
        </div>
        <button class="btn" type="submit" disabled={savingProfile}>{savingProfile ? "Saving…" : "Save details"}</button>
      </form>
    </section>

    <section class="panel">
      <div class="intro">
        <h2>Password</h2>
        <p>Changing it signs you out on every other device.</p>
      </div>
      <form onsubmit={savePassword} oninput={(event) => (passwordErrors = clearEdited(passwordErrors, event))} novalidate>
        {#if passwordMessage}<p class="notice notice-error" role="alert">{passwordMessage}</p>{/if}
        <PasswordField id="current" label="Current password" bind:value={current} error={passwordErrors.current} autocomplete="current-password" />
        <PasswordField id="next" label="New password" bind:value={next} error={passwordErrors.next} hint="At least 10 characters." autocomplete="new-password" />
        <button class="btn" type="submit" disabled={savingPassword}>{savingPassword ? "Saving…" : "Change password"}</button>
      </form>
    </section>
  {/if}

  {#if user.role !== "staff"}
    <section class="panel danger-zone">
      <div class="intro">
        <h2>Delete {user.isGuest ? "this workspace" : "your account"}</h2>
        <p>Your presentations and every session's results are deleted for good.</p>
      </div>
      <div>
        <button class="btn btn-ghost danger" type="button" onclick={() => (deleting = true)}>Delete {user.isGuest ? "workspace" : "account"}</button>
      </div>
    </section>
  {/if}
</div>

<Dialog bind:open={deleting} title={user.isGuest ? "Delete this workspace?" : "Delete your account?"} description="This cannot be undone.">
  <form id="delete-form" onsubmit={deleteAccount} oninput={() => (deleteError = "")} novalidate>
    {#if !user.isGuest}
      <PasswordField id="delete-password" label="Type your password to confirm" bind:value={deletePassword} error={deleteError} autocomplete="current-password" />
    {:else if deleteError}
      <p class="field-error">{deleteError}</p>
    {/if}
  </form>
  {#snippet actions()}
    <button class="btn btn-ghost" type="button" onclick={() => (deleting = false)}>Keep it</button>
    <button class="btn btn-danger" type="submit" form="delete-form">Delete for good</button>
  {/snippet}
</Dialog>

<ClaimDialog bind:open={claiming} />

<style>
  h1 {
    font-size: var(--step-4);
  }

  .sub {
    margin-top: 8px;
    color: var(--ink-3);
  }

  .sections {
    display: grid;
    gap: 20px;
    max-width: 920px;
    margin-top: 32px;
  }

  .panel {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    gap: 24px 40px;
    padding: clamp(20px, 3vw, 32px);
    border: 1px solid var(--line);
    border-radius: var(--radius-l);
    background: var(--card);
  }

  .panel h2 {
    font-size: 1.35rem;
  }

  .intro p,
  .panel p {
    margin-top: 6px;
    color: var(--ink-3);
  }

  form {
    display: grid;
    gap: 16px;
  }

  form .btn {
    justify-self: start;
  }

  /* The form's own gap spaces the fields, the password ones included. */
  form :global(.field + .field) {
    margin-top: 0;
  }

  .highlight {
    grid-template-columns: 1fr auto;
    align-items: center;
    background: var(--sun-soft);
    border-color: transparent;
  }

  .danger-zone {
    border-color: #f1cfcb;
  }

  .danger {
    color: var(--danger);
    border-color: #efc2bd;
  }

  @media (max-width: 760px) {
    .panel,
    .highlight {
      grid-template-columns: 1fr;
    }
  }
</style>
