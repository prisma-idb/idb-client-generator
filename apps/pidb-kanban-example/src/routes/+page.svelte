<script lang="ts">
  import { resolve } from "$app/paths";
  import Button from "$lib/components/ui/button/button.svelte";
</script>

<Button href={resolve("/dashboard")}>Open app</Button>
