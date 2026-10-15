<script lang="ts">
  import SampleStage from "@roomwave/ui/components/SampleStage.svelte";

  import { quadMatrix } from "../lib/perspective.ts";
  import PhoneSample from "./PhoneSample.svelte";

  type Point = [number, number];

  interface Props {
    src: string;
    srcset: string;
    sizes: string;
    alt: string;
    width: number;
    height: number;
    corners: Point[];
    mask: string;
    kind: "stage" | "phone";
    eager?: boolean;
  }

  let { src, srcset, sizes, alt, width, height, corners, mask, kind, eager = false }: Props = $props();

  let shown = $state(0);
  const scale = $derived(shown / width);

  // The screen's own proportions, measured along its edges.
  const edge = (a: Point, b: Point) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const screenW = $derived((edge(corners[0]!, corners[1]!) + edge(corners[3]!, corners[2]!)) / 2);
  const screenH = $derived((edge(corners[0]!, corners[3]!) + edge(corners[1]!, corners[2]!)) / 2);
  const virtualW = $derived(kind === "phone" ? 360 : 960);
  const virtualH = $derived(Math.round(virtualW * (screenH / screenW)));
  const matrix = $derived(
    shown
      ? quadMatrix(
          virtualW,
          virtualH,
          corners.map(([x, y]) => [x * scale, y * scale]) as [Point, Point, Point, Point],
        )
      : "none",
  );
</script>

<div class="photo" style={`aspect-ratio:${width}/${height}`} bind:clientWidth={shown}>
  <img {src} {srcset} {sizes} {alt} {width} {height} loading={eager ? "eager" : "lazy"} decoding="async" fetchpriority={eager ? "high" : "auto"} />
  {#if shown}
    <div class="layer" style={`mask-image:url(${mask});-webkit-mask-image:url(${mask})`} aria-hidden="true">
      <div class="screen {kind}" style={`width:${virtualW}px;height:${virtualH}px;transform:${matrix}`}>
        {#if kind === "stage"}
          <SampleStage scenario="poll" theme="paper" pace={900} />
        {:else}
          <PhoneSample />
        {/if}
        <div class="light"></div>
      </div>
    </div>
  {/if}
</div>

<style>
  .photo {
    position: relative;
    width: 100%;
    overflow: hidden;
    background: var(--paper-3);
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .layer {
    position: absolute;
    inset: 0;
    mask-size: 100% 100%;
    -webkit-mask-size: 100% 100%;
    mask-repeat: no-repeat;
    -webkit-mask-repeat: no-repeat;
    pointer-events: none;
  }

  .screen {
    position: absolute;
    left: 0;
    top: 0;
    transform-origin: 0 0;
    overflow: hidden;
  }

  /* A projector is brighter at the bottom of this screen and never quite black. */
  .stage {
    filter: contrast(0.9) saturate(0.92) brightness(1.02);
  }

  .stage .light {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgb(40 30 20 / 0.32), rgb(40 30 20 / 0.06) 70%, rgb(255 255 255 / 0.04));
    mix-blend-mode: multiply;
  }

  /* Glass on a phone catches a little of the room's light. */
  .phone .light {
    position: absolute;
    inset: 0;
    background: linear-gradient(125deg, rgb(255 255 255 / 0.16), transparent 40%), linear-gradient(0deg, rgb(255 210 160 / 0.08), transparent);
  }
</style>
