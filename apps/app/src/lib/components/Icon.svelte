<script lang="ts" module>
  // 24 × 24 line icons, drawn with a 1.8 stroke.
  const PATHS = {
    plus: "M12 5v14M5 12h14",
    trash: "M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
    copy: "M9 9h10v10H9zM5 15V5h10",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    "arrow-left": "M19 12H5M11 6l-6 6 6 6",
    "arrow-right": "M5 12h14M13 6l6 6-6 6",
    "chevron-left": "M15 6l-6 6 6 6",
    "chevron-right": "M9 6l6 6-6 6",
    "chevron-down": "M6 9l6 6 6-6",
    "chevron-up": "M6 15l6-6 6 6",
    eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "eye-off": "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2",
    lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
    unlock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 7.7-1.5",
    play: "M7 4.5v15l13-7.5z",
    users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14a6.5 6.5 0 0 1 4 7",
    qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2h-2",
    phone: "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2",
    expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
    shrink: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
    x: "M6 6l12 12M18 6L6 18",
    check: "M5 12.5l4.5 4.5L19 7.5",
    download: "M12 4v12M7 11l5 5 5-5M5 20h14",
    mail: "M3 6h18v12H3zM3 7l9 6 9-6",
    refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6",
    chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
    grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
    logout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11",
    user: "M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM4 21a8 8 0 0 1 16 0",
    card: "M3 6h18v12H3zM3 10h18M7 15h3",
    home: "M4 11l8-7 8 7M6 9.5V20h12V9.5",
    flag: "M5 21V4M5 4h12l-2 4 2 4H5",
    inbox: "M4 13l2-8h12l2 8M4 13v6h16v-6M4 13h5l1 2h4l1-2h5",
    pulse: "M3 12h4l3-8 4 16 3-8h4",
    search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
    clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
    edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
    send: "M4 12l16-8-6 16-2-7z",
    sparkle: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
    image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5a1.5 1.5 0 1 0 0-.01",
    "thumb-up": "M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.3 20H7",
    "triangle-up": "M12 6l7 11H5z",
    stop: "M6 6h12v12H6z",
  } as const;

  export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    size?: number;
    label?: string;
    filled?: boolean;
  }

  let { name, size = 20, label, filled = false }: Props = $props();
</script>

<svg
  class="icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled ? "currentColor" : "none"}
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? "img" : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : "true"}
>
  {#if name === "more"}
    <circle cx="5" cy="12" r="1.9" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.9" fill="currentColor" stroke="none" />
  {:else}
    <path d={PATHS[name]} />
  {/if}
</svg>

<style>
  .icon {
    flex: none;
  }
</style>
