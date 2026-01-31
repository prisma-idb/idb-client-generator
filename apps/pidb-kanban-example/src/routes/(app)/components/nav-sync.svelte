<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import CloudIcon from "@lucide/svelte/icons/cloud";
  import PlayIcon from "@lucide/svelte/icons/play";
  import StopCircleIcon from "@lucide/svelte/icons/stop-circle";
  import { getTodosContext } from "../todos-state.svelte";
  import { CloudDownloadIcon, CloudOffIcon, CloudUploadIcon } from "@lucide/svelte";
  import SyncDetailsPopover from "./sync-details/sync-details-popover.svelte";
  import type { ApplyPullResult } from "$lib/prisma-idb/client/apply-pull";
  import type { PushResult } from "$lib/prisma-idb/server/batch-processor";
  import { getClient } from "$lib/clients/idb-client";

  const todosState = getTodosContext();
  const iconMap = {
    STOPPED: CloudOffIcon,
    IDLE: PlayIcon,
    PUSHING: CloudUploadIcon,
    PULLING: CloudDownloadIcon,
  } as const;

  let status = $state<"STOPPED" | "IDLE" | "PUSHING" | "PULLING">("STOPPED");
  let isLooping = $state(false);

  let pushResult = $state<{ results: PushResult[] }>();
  let pullResult = $state<ApplyPullResult>();
  let outboxStats = $state<{ unsynced: number; failed: number; lastError?: string }>();

  async function updateOutboxStats() {
    outboxStats = await getClient().$outbox.stats();
  }

  onMount(() => {
    if (!browser || !todosState.syncWorker) return;

    // Initialize current status
    ({ status, isLooping } = todosState.syncWorker.status);

    // Subscribe to status changes
    const unsubscribeStatusChange = todosState.syncWorker.on("statuschange", () => {
      if (todosState.syncWorker) {
        ({ status, isLooping } = todosState.syncWorker.status);
      }
    });

    const unsubscribePushCompleted = todosState.syncWorker.on("pushcompleted", (e) => {
      pushResult = e.detail;
    });

    const unsubscribePullCompleted = todosState.syncWorker.on("pullcompleted", (e) => {
      pullResult = e.detail;
    });

    getClient().$outbox.subscribe(["create", "update", "delete"], updateOutboxStats);

    return () => {
      unsubscribeStatusChange();
      unsubscribePushCompleted();
      unsubscribePullCompleted();
      getClient().$outbox.unsubscribe(["create", "update", "delete"], updateOutboxStats);
    };
  });
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Sync status</Card.Title>
    <div class="text-muted-foreground flex items-center gap-2 text-sm">
      <span class="capitalize" data-testid="sync-status">{status.toLowerCase()}</span>
      {#if status in iconMap}
        {#await Promise.resolve(iconMap[status]) then Icon}
          <Icon class="h-4 w-4" />
        {/await}
      {/if}
    </div>
    <Card.Action>
      <SyncDetailsPopover {pushResult} {pullResult} {outboxStats} />
    </Card.Action>
  </Card.Header>
  <Card.Footer class="grid gap-2">
    <Button
      class="w-full"
      onclick={() => {
        if (isLooping) todosState.syncWorker?.stop();
        else todosState.syncWithServer();
      }}
    >
      {#if isLooping}
        <StopCircleIcon />
        Stop auto-sync
      {:else}
        <PlayIcon />
        Start auto-sync
      {/if}
    </Button>
    <Button
      variant="secondary"
      class="w-full"
      data-testid="sync-now-button"
      onclick={() => todosState.syncWorker?.syncNow()}
      disabled={!todosState.syncWorker}
    >
      <CloudIcon />
      Sync now
    </Button>
  </Card.Footer>
</Card.Root>
