<script lang="ts">
  import { PLANS, TRIAL_DAYS, formatShillings, type PlanId, type User } from "@roomwave/shared";

  import { post, RequestError } from "#lib/api.ts";
  import Dialog from "#lib/components/Dialog.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import { daysLeft, formatDate } from "#lib/format.ts";
  import { session } from "#lib/session.svelte.ts";
  import { toasts } from "#lib/toast.svelte.ts";

  const user = $derived(session.user!);
  const status = $derived(user.plan);
  let starting = $state(false);
  let confirmTrial = $state(false);

  const order: PlanId[] = ["free", "pro", "organisation"];

  async function startTrial() {
    starting = true;
    try {
      const { user: updated } = await post<{ user: User }>("/api/billing/trial");
      session.set(updated);
      confirmTrial = false;
      toasts.show(`Your Pro trial has started. It runs for ${TRIAL_DAYS} days.`);
    } catch (error) {
      confirmTrial = false;
      toasts.show(error instanceof RequestError ? error.message : "Could not start the trial.", "error");
    } finally {
      starting = false;
    }
  }

  function features(id: PlanId): string[] {
    const plan = PLANS[id];
    return [
      `Up to ${plan.participants.toLocaleString("en-KE")} people in each session`,
      plan.presentations === null ? "Unlimited presentations" : `${plan.presentations} presentations`,
      "Polls, word clouds, ratings, quizzes and Q&A",
      "Spreadsheet export of every session",
      ...(plan.pdfReports ? ["PDF reports, emailed to you"] : []),
      ...(id === "organisation" ? ["Pay by invoice or bank transfer", "Help setting up your first event"] : []),
    ];
  }
</script>

<svelte:head>
  <title>Plan · Roomwave</title>
</svelte:head>

<h1>Your plan</h1>

<section class="current">
  <div>
    <p class="eyebrow">Right now</p>
    <h2>
      {PLANS[status.plan].name}
      {#if status.onTrial}<span class="badge badge-trial">Trial</span>{/if}
    </h2>
    {#if status.onTrial && status.trialEndsAt}
      <p>Your Pro trial ends on {formatDate(status.trialEndsAt)}, in {daysLeft(status.trialEndsAt)} days. After that you are back on Free, and nothing you made is lost.</p>
    {:else if status.plan === "free" && status.trialUsed}
      <p>Your Pro trial has ended. To keep Pro, ask us for an invoice; most teams pay by bank transfer or M-Pesa paybill.</p>
    {:else if status.plan === "free"}
      <p>Free holds rooms of up to {PLANS.free.participants} people and {PLANS.free.presentations} presentations. Try everything in Pro for {TRIAL_DAYS} days, without a card.</p>
    {:else}
      <p>You are on {PLANS[status.plan].name}. Thank you.</p>
    {/if}
  </div>
  <div class="current-actions">
    {#if status.plan === "free" && !status.trialUsed && !user.isGuest}
      <button class="btn btn-signal btn-large" type="button" onclick={() => (confirmTrial = true)}>Start the {TRIAL_DAYS}-day Pro trial</button>
    {:else if status.plan === "free" && !status.trialUsed && user.isGuest}
      <button class="btn btn-signal btn-large" type="button" onclick={() => (confirmTrial = true)}>Try Pro in this workspace</button>
    {/if}
    {#if status.plan === "free" || status.onTrial}
      <a class="btn btn-ghost" href="/contact?topic=invoice" data-sveltekit-reload>Pay for Pro by invoice</a>
    {/if}
  </div>
</section>

<ul class="plans">
  {#each order as id (id)}
    {@const plan = PLANS[id]}
    <li class:current-plan={status.plan === id} class:pro={id === "pro"}>
      <h3>{plan.name}</h3>
      <p class="price">
        {#if plan.monthly === null}
          <strong>Quoted</strong> <span>for your event or team</span>
        {:else if plan.monthly === 0}
          <strong>KSh 0</strong> <span>for ever</span>
        {:else}
          <strong>{formatShillings(plan.yearly!)}</strong> <span>a month, paid yearly, or {formatShillings(plan.monthly)} monthly</span>
        {/if}
      </p>
      <p class="summary">{plan.summary}</p>
      <ul class="features">
        {#each features(id) as feature (feature)}<li><Icon name="check" size={16} /> {feature}</li>{/each}
      </ul>
      {#if status.plan === id}
        <span class="badge here">{status.onTrial ? "Your trial" : "Your plan"}</span>
      {:else if id === "organisation"}
        <a class="btn btn-ghost btn-block" href="/contact?topic=organisation" data-sveltekit-reload>Talk to us</a>
      {/if}
    </li>
  {/each}
</ul>

<Dialog bind:open={confirmTrial} title="Start your Pro trial?" description={`For ${TRIAL_DAYS} days you get everything in Pro: rooms of up to ${PLANS.pro.participants} people, unlimited presentations and PDF reports. No card, and it ends by itself.`}>
  {#snippet actions()}
    <button class="btn btn-ghost" type="button" onclick={() => (confirmTrial = false)}>Not now</button>
    <button class="btn btn-signal" type="button" disabled={starting} onclick={startTrial}>{starting ? "Starting…" : "Start the trial"}</button>
  {/snippet}
  <span></span>
</Dialog>

<style>
  h1 {
    font-size: var(--step-4);
  }

  .current {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) auto;
    align-items: center;
    gap: 24px 40px;
    margin-top: 28px;
    padding: clamp(22px, 3vw, 36px);
    border-radius: var(--radius-l);
    background: var(--stage);
    background-image: radial-gradient(70% 100% at 100% 0%, rgb(255 122 61 / 0.3), transparent 60%), var(--grain);
    color: var(--stage-text);
  }

  .current .eyebrow {
    color: var(--signal);
  }

  .current h2 {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 8px 0;
    font-size: var(--step-3);
  }

  .current p {
    max-width: 58ch;
    color: var(--stage-muted);
  }

  .current-actions {
    display: grid;
    gap: 10px;
  }

  .current-actions .btn-ghost {
    --btn-fg: var(--stage-text);
    --btn-border: var(--stage-line);
  }

  .current-actions .btn-ghost:hover {
    --btn-bg: var(--stage-2);
  }

  .plans {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
    margin: 32px 0 0;
    padding: 0;
    list-style: none;
  }

  .plans > li {
    position: relative;
    display: grid;
    grid-template-rows: auto auto auto 1fr auto;
    gap: 12px;
    padding: 26px;
    border: 1px solid var(--line);
    border-radius: var(--radius-l);
    background: var(--card);
  }

  .plans > li.pro {
    border-color: var(--ink);
    box-shadow: var(--shadow-2);
  }

  .plans > li.current-plan {
    outline: 3px solid var(--signal);
    outline-offset: -1px;
  }

  h3 {
    font-size: 1.5rem;
  }

  .price strong {
    font-family: var(--font-display);
    font-size: 1.7rem;
  }

  .price span,
  .summary {
    color: var(--ink-3);
    font-size: 0.92rem;
  }

  .features {
    display: grid;
    gap: 8px;
    align-content: start;
    margin: 6px 0 0;
    padding: 0;
    list-style: none;
    font-size: 0.95rem;
  }

  .features li {
    display: flex;
    gap: 8px;
    align-items: flex-start;
  }

  .features :global(svg) {
    margin-top: 3px;
    color: var(--lagoon);
  }

  .here {
    justify-self: start;
    background: var(--signal);
    color: var(--ink);
  }

  @media (max-width: 900px) {
    .current {
      grid-template-columns: 1fr;
    }

    .plans {
      grid-template-columns: 1fr;
    }
  }
</style>
