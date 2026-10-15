<script lang="ts">
  import type { SlideType } from "@roomwave/shared";

  let { type, size = 20 }: { type: SlideType; size?: number } = $props();
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
>
  {#if type === "poll"}
    <path d="M5 20V12M10 20V6M15 20v-9M20 20V9" />
  {:else if type === "wordcloud"}
    <path d="M7 18h10a4 4 0 0 0 .6-8A5.5 5.5 0 0 0 7 9.5 4.2 4.2 0 0 0 7 18z" /><path d="M9.5 14h5" />
  {:else if type === "scale"}
    <path d="M3 12h18" /><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="17" cy="12" r="2.8" />
  {:else if type === "qna"}
    <path d="M4 5h16v11h-9l-5 4v-4H4z" /><path d="M10 9a2 2 0 1 1 2.8 1.8c-.5.3-.8.7-.8 1.2M12 13.4h.01" />
  {:else if type === "quiz"}
    <circle cx="12" cy="13" r="7" /><path d="M12 9.5V13l2.5 1.5M10 3h4M12 3v3" />
  {:else}
    <path d="M5 6h14M5 10h14M5 14h10M5 18h7" />
  {/if}
</svg>
