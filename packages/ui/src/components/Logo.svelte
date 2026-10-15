<script lang="ts">
  import Mark from "./Mark.svelte";

  interface Props {
    size?: number;
    tone?: "ink" | "paper";
    live?: boolean;
  }
  let { size = 26, tone = "ink", live = false }: Props = $props();
</script>

<span class="logo" class:paper={tone === "paper"} style={`--size:${size}px`}>
  <Mark size={size * 0.86} {live} />
  <span class="word">roomwave</span>
</span>

<style>
  .logo {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--size) * 0.36);
    color: var(--ink);
    line-height: 1;
  }

  .paper {
    color: var(--paper);
  }

  .word {
    font-family: var(--font-display);
    font-size: var(--size);
    font-weight: 700;
    letter-spacing: -0.04em;
    transform: translateY(-0.04em);
  }
</style>
