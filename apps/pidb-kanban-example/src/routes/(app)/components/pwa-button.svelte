<script lang="ts">
  import { useRegisterSW } from "virtual:pwa-register/svelte";
  import { toast } from "svelte-sonner";
  import type { Writable } from "svelte/store";
  import Button from "$lib/components/ui/button/button.svelte";
  import { CloudIcon, CloudOffIcon } from "@lucide/svelte";
  import { online } from "svelte/reactivity/window";

  let needRefresh: Writable<boolean>;
  let updateServiceWorker: () => void;

  $effect(() => {
    ({ needRefresh, updateServiceWorker } = useRegisterSW({
      onRegistered(r) {
        if (r) {
          setInterval(() => {
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

  $effect(() => {
    if ($needRefresh) {
      toast("An update is available", {
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
