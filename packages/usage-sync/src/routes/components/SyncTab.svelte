<script lang="ts">
  import Button from "$lib/components/ui/button/button.svelte";
  import type { AppState } from "$lib/store.svelte";
  import { toast } from "svelte-sonner";

  let {
    state,
  }: {
    state: AppState;
  } = $props();

  async function syncWithServer() {
    if (!state.client) return;
    try {
      state.isLoading = true;

      // Stop any existing sync worker
      if (state.syncWorker) {
        state.syncWorker.stop();
      }

      const syncWorker = state.client.createSyncWorker({
        syncHandler: async (events) => {
          try {
            const { syncBatch } = await import("../data.remote");
            return await syncBatch(events);
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "Unknown error";
            return events.map((event) => ({
              id: event.id,
              error: errorMessage,
              entityKeyPath: event.entityKeyPath,
            }));
          }
        },
        batchSize: 20,
        intervalMs: 8000,
        maxRetries: 5,
      });

      state.setSyncWorker(syncWorker);
      syncWorker.start();
      toast.success("Sync started! Processing outbox events...");
    } catch (error) {
      console.error("Error starting sync worker:", error);
      toast.error("Failed to start sync worker");
      state.setSyncWorker(null);
    } finally {
      state.isLoading = false;
    }
  }

  async function handleClearSyncedEvents() {
    try {
      const deletedCount = await state.clearSyncedEvents();
      toast.success(`Cleared ${deletedCount} synced events older than 7 days`);
    } catch (error) {
      console.error("Error clearing synced events:", error);
      toast.error("Failed to clear synced events");
    }
  }

  async function handleRetrySyncedFailed() {
    try {
      const retryCount = await state.retrySyncedFailed();
      if (retryCount === 0) {
        toast.info("No failed events to retry");
        return;
      }
      toast.success(`Reset ${retryCount} failed events for retry`);

      // Auto-start sync if not already running
      if (!state.syncWorker) {
        await syncWithServer();
      }
    } catch (error) {
      console.error("Error retrying failed events:", error);
      toast.error("Failed to retry failed events");
    }
  }

  async function handleRefreshStats() {
    try {
      state.isLoading = true;
      await state.loadSyncStats();
      toast.success("Sync stats refreshed");
    } catch {
      toast.error("Failed to refresh stats");
    } finally {
      state.isLoading = false;
    }
  }
</script>

<div class="space-y-4">
  <!-- Sync Control -->
  <div class="rounded-lg border p-6">
    <h2 class="mb-4 text-lg font-semibold">Sync Control</h2>
    <div class="flex gap-2">
      <Button
        disabled={!state.client || state.isLoading || !!state.syncWorker}
        class="flex-1"
        onclick={syncWithServer}
      >
        {state.syncWorker ? "Syncing..." : "Start Sync"}
      </Button>
      {#if state.syncWorker}
        <Button
          variant="outline"
          class="flex-1"
          onclick={() => {
            state.stopSync();
            toast.success("Sync stopped");
          }}
        >
          Stop Sync
        </Button>
      {/if}
    </div>
  </div>

  <!-- Sync Stats -->
  <div class="rounded-lg border p-6">
    <h2 class="mb-4 text-lg font-semibold">Sync Status</h2>
    <div class="grid grid-cols-3 gap-2">
      <div class="rounded-lg border p-3 text-center">
        <div class="text-2xl font-bold">{state.syncStats.unsynced}</div>
        <div class="text-xs text-muted-foreground">Unsynced</div>
      </div>
      <div class="rounded-lg border p-3 text-center">
        <div class="text-2xl font-bold">{state.syncStats.failed}</div>
        <div class="text-xs text-muted-foreground">Failed</div>
      </div>
      <div class="rounded-lg border p-3 text-center">
        <div class="text-2xl font-bold">{state.syncStats.unsynced + state.syncStats.failed}</div>
        <div class="text-xs text-muted-foreground">Total</div>
      </div>
    </div>

    {#if state.syncStats.lastError}
      <div class="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
        <p class="text-xs font-medium text-red-900">Last Error</p>
        <p class="mt-1 text-xs text-red-800">{state.syncStats.lastError}</p>
      </div>
    {/if}
  </div>

  <!-- Sync Options -->
  <div class="rounded-lg border p-6">
    <h2 class="mb-4 text-lg font-semibold">Options</h2>
    <div class="space-y-2">
      <Button
        variant="outline"
        disabled={!state.client || state.isLoading || state.syncStats.failed === 0}
        class="w-full"
        onclick={handleRetrySyncedFailed}
      >
        {state.isLoading ? "Resetting..." : "Retry Failed Events"}
      </Button>
      <Button
        variant="outline"
        disabled={!state.client || state.clearingSynced}
        class="w-full"
        onclick={handleClearSyncedEvents}
      >
        {state.clearingSynced ? "Clearing..." : "Clear Synced (7+ days)"}
      </Button>
      <Button
        variant="outline"
        disabled={!state.client || state.isLoading}
        class="w-full"
        onclick={handleRefreshStats}
      >
        Refresh Stats
      </Button>
    </div>
  </div>
</div>
