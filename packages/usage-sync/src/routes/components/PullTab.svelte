<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
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
		try {
			const parsedScopeKey = scopeKey.trim() === '' ? undefined : scopeKey.trim();

			const { totalAppliedRecords, cursor } = await appState.pullChangesAndRefresh(
				pullChanges,
				parsedScopeKey
			);

			toast.success('Pulled changes successfully!', {
				description: `Applied ${totalAppliedRecords} records. Cursor: ${cursor ?? 'N/A'}`
			});
		} catch (error) {
			console.error('Error pulling changes:', error);
			toast.error('Failed to pull changes');
		}
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
					data-testid="scope-key-input"
				/>
			</div>

			<div class="text-sm text-muted-foreground" data-testid="current-cursor-display">
				Current cursor: {appState.pullCursor ?? 'Not set (will fetch all)'}
			</div>

			<div class="flex gap-2">
				<Button
					onclick={handlePull}
					class="flex-1"
					data-testid="fetch-changes-button"
					disabled={appState.isLoading}
					>{appState.isLoading ? 'Fetching...' : 'Fetch Changes'}</Button
				>
				<Button
					onclick={() => appState.clearPullCursor()}
					variant="outline"
					data-testid="reset-cursor-button">Reset Cursor</Button
				>
			</div>
		</div>
	</div>
</div>
