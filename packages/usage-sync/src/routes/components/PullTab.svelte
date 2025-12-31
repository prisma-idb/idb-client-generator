<script lang="ts">
	import Button from "$lib/components/ui/button/button.svelte";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import type { AppState } from "$lib/store.svelte";
	import { pullChanges } from "../data.remote";

	type PropsType = {
		appState: AppState;
	};

	let { appState }: PropsType = $props();

	let scopeKey = $state('');

	async function handlePull() {
    if (!appState.client) return;
    const parsedScopeKey = scopeKey.trim() === '' ? undefined : scopeKey.trim();

		const allChanges = await pullChanges({ scopeKey: parsedScopeKey });
    for (const { record, model, operation } of allChanges.logsWithRecords) {
      switch (model) {
        case "User":
          switch (operation) {
            case "create":
              appState.client.user.create({ data: record! })
          }
      }
    }
	}
</script>

<div class="space-y-4">
	<div class="rounded-lg border p-6">
		<h2 class="mb-4 text-lg font-semibold">Fetch Changes from Database</h2>
		<div class="space-y-4">
			<div>
				<Label for="scopeKey" class="mb-2 block text-sm font-medium">
					Scope Key (optional)
				</Label>
				<Input
					id="scopeKey"
					type="text"
					bind:value={scopeKey}
					placeholder="Enter scope key..."
					class="w-full"
				/>
			</div>

			<Button onclick={handlePull} class="w-full">
				Fetch Changes
			</Button>
		</div>
	</div>
</div>
