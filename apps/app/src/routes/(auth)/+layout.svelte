<script lang="ts">
  import { SampleStage, Logo } from "@roomwave/ui";

  let { children } = $props();
</script>

<div class="auth">
  <main id="main" class="form-side">
    <a class="home" href="/" data-sveltekit-reload aria-label="Roomwave home"><Logo size={24} /></a>
    <div class="form-wrap">
      {@render children()}
    </div>
    <p class="legal">
      <a href="/terms" data-sveltekit-reload>Terms</a>
      <span aria-hidden="true">·</span>
      <a href="/privacy" data-sveltekit-reload>Privacy</a>
      <span aria-hidden="true">·</span>
      <a href="/contact" data-sveltekit-reload>Contact</a>
    </p>
  </main>

  <aside class="stage-side" aria-hidden="true">
    <div class="stage-copy">
      <p class="eyebrow">Live in the room</p>
      <p class="line">Every answer lands on the screen the moment it is sent.</p>
    </div>
    <div class="screen">
      <SampleStage scenario="poll" theme="ink" pace={700} />
    </div>
  </aside>
</div>

<style>
  .auth {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    min-height: 100dvh;
  }

  .form-side {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: 32px;
    padding: 28px clamp(20px, 5vw, 64px);
  }

  .home {
    justify-self: start;
    text-decoration: none;
  }

  .form-wrap {
    align-self: center;
    width: 100%;
    max-width: 420px;
    margin-inline: auto;
  }

  .form-wrap :global(h1) {
    font-size: clamp(2.1rem, 1.7rem + 1.4vw, 2.9rem);
  }

  .form-wrap :global(.sub) {
    margin-top: 12px;
    color: var(--ink-3);
    font-size: var(--step-1);
    line-height: 1.45;
  }

  .form-wrap :global(form) {
    margin-top: 32px;
  }

  .form-wrap :global(.actions) {
    display: grid;
    gap: 14px;
    margin-top: 28px;
  }

  .form-wrap :global(.alt) {
    margin-top: 28px;
    padding-top: 24px;
    border-top: 1px solid var(--line);
    color: var(--ink-3);
  }

  .form-wrap :global(.alt a) {
    color: var(--signal-strong);
    font-weight: 600;
  }

  .form-wrap :global(.form-notice) {
    margin-bottom: 20px;
  }

  .legal {
    display: flex;
    gap: 10px;
    justify-content: center;
    font-size: 0.85rem;
    color: var(--ink-3);
  }

  .legal a {
    color: inherit;
  }

  .stage-side {
    position: relative;
    display: grid;
    grid-template-rows: auto 1fr;
    gap: 28px;
    padding: clamp(32px, 5vw, 64px);
    background: var(--stage);
    background-image: radial-gradient(80% 60% at 60% 0%, rgb(255 122 61 / 0.28), transparent 65%), var(--grain);
    color: var(--stage-text);
    overflow: hidden;
  }

  .stage-copy {
    max-width: 30ch;
  }

  .stage-copy .eyebrow {
    color: var(--signal);
  }

  .line {
    margin-top: 10px;
    font-family: var(--font-display);
    font-size: var(--step-3);
    font-weight: 700;
    line-height: 1.05;
    letter-spacing: -0.03em;
  }

  .screen {
    align-self: center;
    aspect-ratio: 16 / 9;
    width: 100%;
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 30px 80px -20px rgb(0 0 0 / 0.6), 0 0 0 1px rgb(255 255 255 / 0.06);
  }

  @media (max-width: 900px) {
    .auth {
      grid-template-columns: 1fr;
    }

    .stage-side {
      display: none;
    }
  }
</style>
