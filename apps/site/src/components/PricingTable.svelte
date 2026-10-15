<script lang="ts">
  import { PLANS, TRIAL_DAYS, formatShillings, type PlanId } from "@roomwave/shared";

  let yearly = $state(true);
  const order: PlanId[] = ["free", "pro", "organisation"];

  const features: Record<PlanId, string[]> = {
    free: [
      `Up to ${PLANS.free.participants} people in a session`,
      `${PLANS.free.presentations} presentations`,
      "All six kinds of slide",
      "Phone remote and moderation",
      "Spreadsheet export",
    ],
    pro: [
      `Up to ${PLANS.pro.participants} people in a session`,
      "Unlimited presentations",
      "All six kinds of slide",
      "PDF reports, emailed to you",
      `${TRIAL_DAYS} days free, no card`,
    ],
    organisation: [
      `Up to ${PLANS.organisation.participants.toLocaleString("en-KE")} people in a session`,
      "Pay by invoice, bank transfer or M-Pesa paybill",
      "PDF reports, emailed to you",
      "Help before and during your event",
    ],
  };

  const cta: Record<PlanId, { href: string; label: string }> = {
    free: { href: "/signup", label: "Start free" },
    pro: { href: "/signup", label: `Start the ${TRIAL_DAYS}-day trial` },
    organisation: { href: "/contact?topic=organisation", label: "Talk to us" },
  };
</script>

<div class="pricing">
  <div class="toggle" role="radiogroup" aria-label="Billing">
    <button type="button" role="radio" aria-checked={!yearly} class:on={!yearly} onclick={() => (yearly = false)}>Monthly</button>
    <button type="button" role="radio" aria-checked={yearly} class:on={yearly} onclick={() => (yearly = true)}>Yearly <span class="save">2 months free</span></button>
  </div>

  <ul class="plans">
    {#each order as id (id)}
      {@const plan = PLANS[id]}
      <li class:featured={id === "pro"}>
        {#if id === "pro"}<span class="flag">Most chosen</span>{/if}
        <h3>{plan.name}</h3>
        <p class="summary">{plan.summary}</p>
        <p class="price">
          {#if plan.monthly === null}
            <strong>Quoted</strong><span>for your team or event</span>
          {:else if plan.monthly === 0}
            <strong>KSh 0</strong><span>for as long as you like</span>
          {:else}
            <strong>{formatShillings(yearly ? plan.yearly! : plan.monthly)}</strong><span>a month{yearly ? `, paid yearly (${formatShillings(plan.yearly! * 12)})` : ""}</span>
          {/if}
        </p>
        <a class="btn btn-block {id === 'pro' ? 'btn-signal' : 'btn-ghost'}" href={cta[id].href}>{cta[id].label}</a>
        <ul class="features">
          {#each features[id] as item (item)}<li>{item}</li>{/each}
        </ul>
      </li>
    {/each}
  </ul>
</div>

<style>
  .pricing {
    display: grid;
    gap: 28px;
  }

  .toggle {
    justify-self: center;
    display: inline-flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: var(--paper-2);
    border: 1px solid var(--line);
  }

  .toggle button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 40px;
    padding: 0 18px;
    border: 0;
    border-radius: 999px;
    background: transparent;
    font-weight: 600;
    color: var(--ink-2);
    cursor: pointer;
  }

  .toggle button.on {
    background: var(--card);
    color: var(--ink);
    box-shadow: var(--shadow-1);
  }

  .save {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--lagoon-soft);
    color: var(--lagoon-strong);
    font-size: 0.78rem;
  }

  .plans {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 20px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .plans > li {
    position: relative;
    display: grid;
    grid-template-rows: auto auto auto auto 1fr;
    gap: 14px;
    padding: 30px 26px;
    border: 1px solid var(--line);
    border-radius: var(--radius-l);
    background: var(--card);
  }

  .plans > li.featured {
    border: 2px solid var(--ink);
    box-shadow: var(--shadow-3);
  }

  .flag {
    position: absolute;
    top: -13px;
    left: 24px;
    padding: 3px 12px;
    border-radius: 999px;
    background: var(--signal);
    font-size: 0.78rem;
    font-weight: 700;
  }

  h3 {
    font-size: 1.6rem;
  }

  .summary {
    color: var(--ink-3);
    min-height: 3em;
  }

  .price {
    display: grid;
    gap: 2px;
  }

  .price strong {
    font-family: var(--font-display);
    font-size: 2.4rem;
    letter-spacing: -0.03em;
    line-height: 1;
  }

  .price span {
    font-size: 0.9rem;
    color: var(--ink-3);
  }

  .features {
    display: grid;
    gap: 10px;
    align-content: start;
    margin: 6px 0 0;
    padding: 18px 0 0;
    border-top: 1px solid var(--line);
    list-style: none;
  }

  .features li {
    display: flex;
    gap: 10px;
  }

  .features li::before {
    content: "✓";
    flex: none;
    font-weight: 800;
    color: var(--lagoon);
  }

  @media (max-width: 900px) {
    .plans {
      grid-template-columns: 1fr;
    }

    .summary {
      min-height: 0;
    }
  }
</style>
