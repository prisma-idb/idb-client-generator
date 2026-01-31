<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import CloudIcon from "@lucide/svelte/icons/cloud";
  import PlayIcon from "@lucide/svelte/icons/play";
  import StopCircleIcon from "@lucide/svelte/icons/stop-circle";
  import { getTodosContext } from "../todos-state.svelte";
  import { ChevronsUpDownIcon, CloudDownloadIcon, CloudOffIcon, CloudUploadIcon } from "@lucide/svelte";
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

<Sidebar.Menu>
  <Sidebar.MenuItem>
    <Popover.Root>
      <Popover.Trigger>
        {#snippet child({ props })}
          <Sidebar.MenuButton size="lg" {...props}>
            {@const Icon = iconMap[status]}
            <div class="bg-secondary rounded-lg p-2">
              <Icon class="size-4" />
            </div>
            <div class="grid flex-1 text-start text-sm leading-tight">
              <span class="font-medium">Sync status</span>
              <span class="text-xs capitalize" data-testid="sync-status">{status.toLowerCase()}</span>
            </div>
            <ChevronsUpDownIcon class="ms-auto size-4" />
          </Sidebar.MenuButton>
        {/snippet}
      </Popover.Trigger>

      <Popover.Content side="top" align="start" class="w-60 rounded-lg border-0 p-0">
        <Card.Root>
          <Card.Header>
            <Card.Title>Sync status</Card.Title>
            <Card.Description>
              {#if status === "PUSHING"}
                Pushing changes to server
              {:else if status === "PULLING"}
                Pulling updates from server
              {:else if status === "IDLE"}
                Sync is idle, auto-sync is {isLooping ? "enabled" : "disabled"}
              {:else}
                Sync is stopped
              {/if}
            </Card.Description>
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
              onclick={() => todosState.syncWorker?.syncNow()}
              disabled={!todosState.syncWorker}
            >
              <CloudIcon />
              Sync now
            </Button>
          </Card.Footer>
        </Card.Root>
      </Popover.Content>
    </Popover.Root>
  </Sidebar.MenuItem>
</Sidebar.Menu>
