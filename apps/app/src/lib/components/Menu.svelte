<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    label: string;
    /** Which edge of the button the list lines up with. */
    align?: "start" | "end";
    direction?: "down" | "up";
    trigger: Snippet;
    children: Snippet<[() => void]>;
    buttonClass?: string;
  }

  let { label, align = "end", direction = "down", trigger, children, buttonClass = "menu-button" }: Props = $props();

  let open = $state(false);
  let root: HTMLDivElement | undefined = $state();
  const close = () => (open = false);

  $effect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root && !root.contains(event.target as Node)) open = false;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        open = false;
        root?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    queueMicrotask(() => root?.querySelector<HTMLElement>(".list button, .list a")?.focus());
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  });
</script>

<div class="menu" bind:this={root}>
  <button
    type="button"
    class={buttonClass}
    aria-label={label}
    aria-haspopup="menu"
    aria-expanded={open}
    onclick={() => (open = !open)}
  >
    {@render trigger()}
  </button>
  <!-- Only in the page while open: a hidden list must not widen the page. -->
  {#if open}
    <div class="list {align} {direction}" role="menu">
      {@render children(close)}
    </div>
  {/if}
</div>

<style>
  .menu {
    position: relative;
    display: inline-flex;
  }

  .list {
    position: absolute;
    z-index: 50;
    min-width: 200px;
    max-width: min(300px, calc(100vw - 32px));
    padding: 6px;
    border: 1px solid var(--line);
    border-radius: var(--radius-m);
    background: var(--card);
    box-shadow: var(--shadow-3);
    animation: drop 160ms var(--ease-out);
  }

  .down {
    top: calc(100% + 6px);
  }

  .up {
    bottom: calc(100% + 6px);
  }

  .end {
    right: 0;
  }

  .start {
    left: 0;
  }

  .list :global(button),
  .list :global(a) {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 40px;
    padding: 8px 10px;
    border: 0;
    border-radius: var(--radius-s);
    background: transparent;
    color: var(--ink);
    font-size: 0.95rem;
    font-weight: 500;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }

  .list :global(button:hover),
  .list :global(a:hover),
  .list :global(button:focus-visible),
  .list :global(a:focus-visible) {
    background: var(--paper-2);
    outline: none;
  }

  .list :global(button:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
    background: transparent;
  }

  .list :global(.danger) {
    color: var(--danger);
  }

  .list :global(hr) {
    margin: 6px 4px;
    border: 0;
    border-top: 1px solid var(--line);
  }

  @keyframes drop {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
</style>
