<script lang="ts">
  import { useRegisterSW } from "virtual:pwa-register/svelte";
  import { onDestroy, onMount } from "svelte";
  import { toast } from "svelte-sonner";
  import { writable, type Writable } from "svelte/store";
  import Button from "$lib/components/ui/button/button.svelte";
  import { CloudIcon, CloudOffIcon } from "@lucide/svelte";
  import { online } from "svelte/reactivity/window";

  let needRefresh: Writable<boolean> = writable(false);
  let updateServiceWorker: () => void;
  let intervalId: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    ({ needRefresh, updateServiceWorker } = useRegisterSW({
      onRegistered(r) {
        if (r) {
          // Clear any existing interval before creating a new one
          if (intervalId !== undefined) {
            clearInterval(intervalId);
          }
          intervalId = setInterval(() => {
            console.log("Checking for sw update");
            r.update();
          }, 20000);
        }
        console.log(`SW Registered: ${r}`);
      },
      onRegisterError(error) {
        console.log("SW registration error", error);
      },
    }));
  });

  // Clean up interval on component unmount
  onDestroy(() => {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
    }
  });

  $effect(() => {
    if ($needRefresh) {
      toast.info("An update is available", {
        action: { label: "Update", onClick: () => updateServiceWorker() },
      });
    }
  });
</script>

{#if online}
  <Button variant="outline">
    {#if online.current}
      <CloudIcon /> Online
    {:else}
      <CloudOffIcon /> Offline
    {/if}
  </Button>
{/if}
