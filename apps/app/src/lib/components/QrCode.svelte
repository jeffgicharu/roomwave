<script lang="ts">
  import QRCode from "qrcode";

  interface Props {
    value: string;
    color?: string;
    background?: string;
    label: string;
  }

  let { value, color = "#1d1430", background = "#ffffff", label }: Props = $props();

  let svg = $state("");
  $effect(() => {
    QRCode.toString(value, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: color, light: background },
    }).then((markup) => (svg = markup));
  });
</script>

<div class="qr" role="img" aria-label={label}>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -- the markup is drawn by the QR library from our own address -->
  {@html svg}
</div>

<style>
  .qr {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 8%;
    overflow: hidden;
    background: var(--qr-bg, #fff);
  }

  .qr :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>
