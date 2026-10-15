<script lang="ts">
  interface Props {
    size?: number;
    color?: string;
    /** The bars rise and fall, as when answers are coming in. */
    live?: boolean;
    title?: string;
  }
  let { size = 28, color = "var(--signal)", live = false, title }: Props = $props();
  const bars = [
    { x: 0, h: 9 },
    { x: 7, h: 15 },
    { x: 14, h: 22 },
    { x: 21, h: 15 },
    { x: 28, h: 24 },
  ];
</script>

<svg
  class="mark"
  class:live
  width={size * (33 / 24)}
  height={size}
  viewBox="0 0 33 24"
  fill={color}
  role={title ? "img" : undefined}
  aria-hidden={title ? undefined : "true"}
  aria-label={title}
>
  {#each bars as bar, i (bar.x)}
    <rect x={bar.x} y={24 - bar.h} width="5" height={bar.h} rx="2.5" style={`--i:${i}`} />
  {/each}
</svg>

<style>
  .mark {
    flex: none;
    overflow: visible;
  }

  rect {
    transform-box: fill-box;
    transform-origin: 50% 100%;
  }

  .live rect {
    animation: rise 1.4s var(--ease-out, ease-out) infinite alternate;
    animation-delay: calc(var(--i) * -0.28s);
  }

  @keyframes rise {
    from {
      transform: scaleY(0.45);
    }
    to {
      transform: scaleY(1);
    }
  }
</style>
