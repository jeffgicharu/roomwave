<script lang="ts">
  import { onMount } from "svelte";

  import { CONTACT_TOPICS, CONTACT_TOPIC_LABELS, contactSchema } from "@roomwave/shared";

  type Topic = (typeof CONTACT_TOPICS)[number];

  let name = $state("");
  let email = $state("");
  let organisation = $state("");
  let topic = $state<Topic>("organisation");
  let message = $state("");
  let errors = $state<Record<string, string>>({});
  let formMessage = $state("");
  let busy = $state(false);
  let sent = $state(false);

  onMount(() => {
    const asked = new URLSearchParams(location.search).get("topic");
    if (asked && (CONTACT_TOPICS as readonly string[]).includes(asked)) topic = asked as Topic;
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    formMessage = "";
    const parsed = contactSchema.safeParse({ name, email, organisation, topic, message });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join(".");
        if (!next[key]) next[key] = issue.message;
      }
      errors = next;
      return;
    }
    errors = {};
    busy = true;
    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (response.ok) {
        sent = true;
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { message?: string; fields?: Record<string, string> };
      errors = body.fields ?? {};
      formMessage = body.fields ? "" : (body.message ?? "Your message did not send. Please try again.");
    } catch {
      formMessage = "We could not reach Roomwave. Check your connection and try again.";
    } finally {
      busy = false;
    }
  }
</script>

{#if sent}
  <div class="sent" role="status">
    <p class="big">Thank you, {name.split(" ")[0]}.</p>
    <p>Your message is with our team. We usually reply within one working day, to <strong>{email}</strong>.</p>
  </div>
{:else}
  <form onsubmit={submit} novalidate>
    {#if formMessage}<p class="notice notice-error" role="alert">{formMessage}</p>{/if}
    <div class="row">
      <div class="field">
        <label class="label" for="c-name">Your name</label>
        <input id="c-name" class="input" autocomplete="name" bind:value={name} aria-invalid={errors.name ? "true" : undefined} aria-describedby={errors.name ? "c-name-e" : undefined} />
        {#if errors.name}<p class="field-error" id="c-name-e">{errors.name}</p>{/if}
      </div>
      <div class="field">
        <label class="label" for="c-email">Email</label>
        <input id="c-email" class="input" type="email" autocomplete="email" bind:value={email} aria-invalid={errors.email ? "true" : undefined} aria-describedby={errors.email ? "c-email-e" : undefined} />
        {#if errors.email}<p class="field-error" id="c-email-e">{errors.email}</p>{/if}
      </div>
    </div>
    <div class="row">
      <div class="field">
        <label class="label" for="c-org">Organisation <span class="optional">(optional)</span></label>
        <input id="c-org" class="input" autocomplete="organization" bind:value={organisation} aria-invalid={errors.organisation ? "true" : undefined} />
        {#if errors.organisation}<p class="field-error">{errors.organisation}</p>{/if}
      </div>
      <div class="field">
        <label class="label" for="c-topic">What is it about?</label>
        <select id="c-topic" class="select" bind:value={topic}>
          {#each CONTACT_TOPICS as t (t)}<option value={t}>{CONTACT_TOPIC_LABELS[t]}</option>{/each}
        </select>
      </div>
    </div>
    <div class="field">
      <label class="label" for="c-message">Message</label>
      <textarea id="c-message" class="textarea" rows="6" bind:value={message} aria-invalid={errors.message ? "true" : undefined} aria-describedby={errors.message ? "c-message-e" : "c-message-h"}></textarea>
      {#if errors.message}<p class="field-error" id="c-message-e">{errors.message}</p>{:else}<p class="hint" id="c-message-h">For an event, tell us the date and roughly how many people.</p>{/if}
    </div>
    <button class="btn btn-signal btn-large" type="submit" disabled={busy}>{busy ? "Sending…" : "Send message"}</button>
  </form>
{/if}

<style>
  form {
    display: grid;
    gap: 18px;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 18px;
  }

  .field + .field {
    margin-top: 0;
  }

  .optional {
    font-weight: 400;
    color: var(--ink-3);
  }

  .select {
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231d1430' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 12px center;
    background-size: 18px;
    padding-right: 40px;
  }

  button {
    justify-self: start;
  }

  .sent {
    display: grid;
    gap: 10px;
    padding: 32px;
    border-radius: var(--radius-l);
    background: var(--lagoon-soft);
  }

  .big {
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 700;
  }

  @media (max-width: 640px) {
    .row {
      grid-template-columns: 1fr;
    }
  }
</style>
