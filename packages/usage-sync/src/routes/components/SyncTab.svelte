<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import type { AppState } from '$lib/store.svelte';
	import { toast } from 'svelte-sonner';

	type PropsType = {
		appState: AppState;
	};

	let { appState }: PropsType = $props();

	async function syncWithServer() {
		if (!appState.client) return;
		try {
			appState.isLoading = true;

			// Stop any existing sync worker
			if (appState.syncWorker) {
				appState.syncWorker.stop();
			}

			const syncWorker = appState.client.createSyncWorker({
				syncHandler: async (events) => {
					try {
						const { syncBatch } = await import('../data.remote');
						return await syncBatch(events);
					} catch (err) {
						const errorMessage = err instanceof Error ? err.message : 'Unknown error';
						return events.map((event) => ({
							id: event.id,
							error: errorMessage,
							entityKeyPath: event.entityKeyPath
						}));
					}
				},
				batchSize: 20,
				intervalMs: 8000,
				maxRetries: 5
			});

			appState.setSyncWorker(syncWorker);
			syncWorker.start();
			toast.success('Sync started! Processing outbox events...');
		} catch (error) {
			console.error('Error starting sync worker:', error);
			toast.error('Failed to start sync worker');
			appState.setSyncWorker(null);
		} finally {
			appState.isLoading = false;
		}
	}

	async function handleClearSyncedEvents() {
		try {
			const deletedCount = await appState.clearSyncedEvents();
			toast.success(`Cleared ${deletedCount} synced events older than 7 days`);
		} catch (error) {
			console.error('Error clearing synced events:', error);
			toast.error('Failed to clear synced events');
		}
	}

	async function handleRetrySyncedFailed() {
		try {
			const retryCount = await appState.retrySyncedFailed();
			if (retryCount === 0) {
				toast.info('No failed events to retry');
				return;
			}
			toast.success(`Reset ${retryCount} failed events for retry`);

			// Auto-start sync if not already running
			if (!appState.syncWorker) {
				await syncWithServer();
			}
		} catch (error) {
			console.error('Error retrying failed events:', error);
			toast.error('Failed to retry failed events');
		}
	}

	async function handleRefreshStats() {
		try {
			appState.isLoading = true;
			await appState.loadSyncStats();
			toast.success('Sync stats refreshed');
		} catch {
			toast.error('Failed to refresh stats');
		} finally {
			appState.isLoading = false;
		}
	}

	async function clearLocalDatabase() {
		try {
			appState.isLoading = true;
			await appState.client?.resetDatabase();
			toast.success('Local database cleared');
		} catch (error) {
			console.error('Error clearing local database:', error);
			toast.error('Failed to clear local database');
		} finally {
			appState.isLoading = false;
		}
	}
</script>

<div class="space-y-4">
	<!-- Sync Control -->
	<div class="rounded-lg border p-6">
		<h2 class="mb-4 text-lg font-semibold">Sync Control</h2>
		<div class="flex gap-2">
			<Button
				disabled={!appState.client || appState.isLoading || !!appState.syncWorker}
				class="flex-1"
				onclick={syncWithServer}
			>
				{appState.syncWorker ? 'Syncing...' : 'Start Sync'}
			</Button>
			{#if appState.syncWorker}
				<Button
					variant="outline"
					class="flex-1"
					onclick={() => {
						appState.stopSync();
						toast.success('Sync stopped');
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
				<div class="text-2xl font-bold">{appState.syncStats.unsynced}</div>
				<div class="text-xs text-muted-foreground">Unsynced</div>
			</div>
			<div class="rounded-lg border p-3 text-center">
				<div class="text-2xl font-bold">{appState.syncStats.failed}</div>
				<div class="text-xs text-muted-foreground">Failed</div>
			</div>
			<div class="rounded-lg border p-3 text-center">
				<div class="text-2xl font-bold">
					{appState.syncStats.unsynced + appState.syncStats.failed}
				</div>
				<div class="text-xs text-muted-foreground">Total</div>
			</div>
		</div>

		{#if appState.syncStats.lastError}
			<div class="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
				<p class="text-xs font-medium text-red-900">Last Error</p>
				<p class="mt-1 text-xs text-red-800">{appState.syncStats.lastError}</p>
			</div>
		{/if}
	</div>

	<!-- Sync Options -->
	<div class="rounded-lg border p-6">
		<h2 class="mb-4 text-lg font-semibold">Options</h2>
		<div class="space-y-2">
			<Button
				variant="outline"
				disabled={!appState.client || appState.isLoading || appState.syncStats.failed === 0}
				class="w-full"
				onclick={handleRetrySyncedFailed}
			>
				{appState.isLoading ? 'Resetting...' : 'Retry Failed Events'}
			</Button>
			<Button
				variant="outline"
				disabled={!appState.client || appState.clearingSynced}
				class="w-full"
				onclick={handleClearSyncedEvents}
			>
				{appState.clearingSynced ? 'Clearing...' : 'Clear Synced (7+ days)'}
			</Button>
			<Button
				variant="outline"
				disabled={!appState.client || appState.isLoading}
				class="w-full"
				onclick={handleRefreshStats}
			>
				Refresh Stats
			</Button>
			<Button
				variant="destructive"
				disabled={!appState.client || appState.isLoading}
				class="w-full"
				onclick={clearLocalDatabase}
			>
				Clear local database
			</Button>
		</div>
	</div>
</div>
