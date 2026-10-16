<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    open: boolean;
    title: string;
    description?: string;
    wide?: boolean;
    onclose?: () => void;
    children: Snippet;
    actions?: Snippet;
  }

  let { open = $bindable(), title, description, wide = false, onclose, children, actions }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  // Several dialogs can sit on one page, so each names itself with its own ids.
  const uid = $props.id();

  // The browser's own modal dialog: focus is held inside it, Escape closes it,
  // and everything behind it is inert.
  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  function closed() {
    open = false;
    onclose?.();
  }
</script>

<dialog
  bind:this={dialog}
  class:wide
  aria-labelledby={`${uid}-title`}
  aria-describedby={description ? `${uid}-description` : undefined}
  onclose={closed}
  onclick={(event) => {
    if (event.target === dialog) open = false;
  }}
>
  <div class="panel">
    <header>
      <h2 id={`${uid}-title`}>{title}</h2>
      <button type="button" class="close" aria-label="Close" onclick={() => (open = false)}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      </button>
    </header>
    {#if description}<p class="description" id={`${uid}-description`}>{description}</p>{/if}
    <div class="body">{@render children()}</div>
    {#if actions}<footer>{@render actions()}</footer>{/if}
  </div>
</dialog>

<style>
  dialog {
    width: min(480px, calc(100vw - 32px));
    max-height: calc(100dvh - 48px);
    padding: 0;
    border: 0;
    border-radius: var(--radius-l);
    background: var(--card);
    color: var(--ink);
    box-shadow: var(--shadow-3);
    overflow: auto;
  }

  dialog.wide {
    width: min(880px, calc(100vw - 32px));
  }

  dialog[open] {
    animation: rise 260ms var(--ease-out);
  }

  dialog::backdrop {
    background: rgb(22 15 36 / 0.55);
    backdrop-filter: blur(3px);
  }

  .panel {
    padding: 24px;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }

  h2 {
    font-size: var(--step-2);
  }

  .close {
    flex: none;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    margin: -6px -6px 0 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--ink-3);
    cursor: pointer;
  }

  .close:hover {
    background: var(--paper-2);
    color: var(--ink);
  }

  .close svg {
    width: 16px;
    height: 16px;
  }

  .description {
    margin-top: 8px;
    color: var(--ink-3);
  }

  .body {
    margin-top: 20px;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
    margin-top: 24px;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.98);
    }
  }
</style>
