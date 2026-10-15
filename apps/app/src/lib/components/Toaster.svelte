<script lang="ts">
  import { toasts } from "../toast.svelte.ts";
</script>

<div class="toaster" role="status" aria-live="polite">
  {#each toasts.items as toast (toast.id)}
    <div class="toast {toast.tone}">
      <span class="dot" aria-hidden="true"></span>
      <span class="message">{toast.message}</span>
      {#if toast.action}
        {@const action = toast.action}
        <button type="button" class="action" onclick={() => { toasts.dismiss(toast.id); action.run(); }}>{action.label}</button>
      {/if}
      <button type="button" class="close" aria-label="Dismiss" onclick={() => toasts.dismiss(toast.id)}>×</button>
    </div>
  {/each}
</div>

<style>
  .toaster {
    position: fixed;
    left: 50%;
    bottom: max(20px, env(safe-area-inset-bottom));
    z-index: 200;
    display: grid;
    gap: 8px;
    width: min(440px, calc(100vw - 32px));
    transform: translateX(-50%);
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 12px 12px 16px;
    border-radius: var(--radius-m);
    background: var(--ink);
    color: var(--paper);
    box-shadow: var(--shadow-3);
    font-size: 0.95rem;
    font-weight: 500;
    pointer-events: auto;
    animation: pop 320ms var(--ease-spring);
  }

  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--lagoon);
  }

  .error .dot {
    background: #ff7b6b;
  }

  .info .dot {
    background: var(--sun);
  }

  .message {
    flex: 1;
  }

  .action {
    flex: none;
    padding: 6px 12px;
    border: 0;
    border-radius: 999px;
    background: var(--stage-2);
    color: var(--paper);
    font-weight: 700;
    cursor: pointer;
  }

  .action:hover {
    background: var(--signal);
    color: var(--ink);
  }

  .close {
    flex: none;
    width: 30px;
    height: 30px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--stage-muted);
    font-size: 1.3rem;
    line-height: 1;
    cursor: pointer;
  }

  .close:hover {
    background: var(--stage-2);
    color: var(--paper);
  }

  @keyframes pop {
    from {
      opacity: 0;
      transform: translateY(12px) scale(0.97);
    }
  }
</style>
