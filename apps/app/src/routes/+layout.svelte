<script lang="ts">
  import "@roomwave/ui/styles/base.css";

  import Toaster from "#lib/components/Toaster.svelte";

  let { children } = $props();
</script>

<a class="skip-link" href="#main">Skip to content</a>
{@render children()}
<Toaster />
