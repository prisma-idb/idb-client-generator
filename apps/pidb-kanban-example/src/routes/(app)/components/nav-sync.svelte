<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import CloudIcon from "@lucide/svelte/icons/cloud";
  import CloudOffIcon from "@lucide/svelte/icons/cloud-off";
  import PlayIcon from "@lucide/svelte/icons/play";
  import StopCircleIcon from "@lucide/svelte/icons/stop-circle";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import ArrowDownIcon from "@lucide/svelte/icons/arrow-down";
  import { getTodosContext } from "../todos-state.svelte";

  const todosState = getTodosContext();

  let status = $state<"STOPPED" | "IDLE" | "PUSHING" | "PULLING">("STOPPED");
  let isLooping = $state(false);

  onMount(() => {
    if (!browser || !todosState.syncWorker) return;

    // Initialize current status
    ({ status, isLooping } = todosState.syncWorker.status);

    // Subscribe to status changes
    const unsubscribe = todosState.syncWorker.on("statuschange", () => {
      if (todosState.syncWorker) {
        ({ status, isLooping } = todosState.syncWorker.status);
      }
    });

    return () => {
      unsubscribe();
    };
  });
</script>

<Sidebar.Menu>
  <Sidebar.MenuItem>
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          <Sidebar.MenuButton
            size="lg"
            class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            {...props}
          >
            {#if status !== "STOPPED"}
              <CloudIcon class="mx-2 size-8 rounded-lg" />
            {:else}
              <CloudOffIcon class="mx-2 size-8 rounded-lg opacity-60" />
            {/if}
            <div class="grid flex-1 text-start text-sm leading-tight">
              <span class="truncate font-medium">Sync status</span>
              <span class="flex items-center gap-1 truncate text-xs">
                {#if status === "PUSHING"}
                  Pushing
                  <ArrowUpIcon class="size-3" />
                {:else if status === "PULLING"}
                  Pulling
                  <ArrowDownIcon class="size-3" />
                {:else if status === "IDLE"}
                  Idle
                {:else}
                  Stopped
                {/if}
              </span>
            </div>
            <ChevronsUpDownIcon class="ms-auto size-4" />
          </Sidebar.MenuButton>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
        side="top"
        align="end"
        sideOffset={4}
      >
        <DropdownMenu.Item
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
        </DropdownMenu.Item>
        <DropdownMenu.Item onclick={() => todosState.syncWorker?.syncNow()} disabled={!todosState.syncWorker}>
          <CloudIcon />
          Sync now (once)
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </Sidebar.MenuItem>
</Sidebar.Menu>
