<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { applyPull } from '$lib/prisma-idb/client/apply-remote-changes';
	import type { AppState } from '$lib/store.svelte';
	import { toast } from 'svelte-sonner';
	import { pullChanges } from '../data.remote';

	type PropsType = {
		appState: AppState;
	};

	let { appState }: PropsType = $props();

	let scopeKey = $state('');

	async function handlePull() {
		if (!appState.client) return;
		const parsedScopeKey = scopeKey.trim() === '' ? undefined : scopeKey.trim();

		const { cursor, logsWithRecords } = await pullChanges({
			scopeKey: parsedScopeKey,
			since: appState.pullCursor
		});
		const { totalAppliedRecords } = await applyPull(appState.client, logsWithRecords);

		// Save the cursor for next pull (convert bigint to number if needed)
		const cursorValue =
			cursor !== undefined ? (typeof cursor === 'bigint' ? Number(cursor) : cursor) : undefined;
		appState.savePullCursor(cursorValue);

		toast.success('Pulled changes successfully!', {
			description: `Applied ${totalAppliedRecords} records. Cursor: ${cursorValue ?? 'N/A'}`
		});
	}
</script>

<div class="space-y-4">
	<div class="rounded-lg border p-6">
		<h2 class="mb-4 text-lg font-semibold">Fetch Changes from Database</h2>
		<div class="space-y-4">
			<div>
				<Label for="scopeKey" class="mb-2 block text-sm font-medium">Scope Key (optional)</Label>
				<Input
					id="scopeKey"
					type="text"
					bind:value={scopeKey}
					placeholder="Enter scope key..."
					class="w-full"
				/>
			</div>

			<div class="text-sm text-muted-foreground">
				Current cursor: {appState.pullCursor ?? 'Not set (will fetch all)'}
			</div>

			<div class="flex gap-2">
				<Button onclick={handlePull} class="flex-1">Fetch Changes</Button>
				<Button onclick={() => appState.clearPullCursor()} variant="outline">Reset Cursor</Button>
			</div>
		</div>
	</div>
</div>
