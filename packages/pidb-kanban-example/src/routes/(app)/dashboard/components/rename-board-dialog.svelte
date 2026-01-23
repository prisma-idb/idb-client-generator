<script lang="ts">
	import { client } from '$lib/clients/idb-client';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import type { Board } from '$lib/generated/prisma/client';
	import { PencilIcon } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	let { open = $bindable(false), board }: { open?: boolean; board: Board } = $props();

	let newName = $state('');

	async function renameBoard(event: Event) {
		event.preventDefault();
		try {
			await client.board.update({
				where: { id: board.id },
				data: { name: newName }
			});
			toast.success('Board renamed successfully');
		} catch (error) {
			toast.error('Failed to rename board');
			console.error('Error renaming board:', error);
		}
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Rename board <span class="italic">{board.name}</span>&nbsp;?</Dialog.Title>
		</Dialog.Header>
		<form class="contents" onsubmit={renameBoard}>
			<Label class="flex flex-col items-start gap-2">
				New board name
				<Input bind:value={newName} required data-testid={`rename-board-${board.name}-input`} />
			</Label>
			<Button class="ml-auto" type="submit" data-testid={`rename-board-${board.name}-submit`}>
				Rename
				<PencilIcon />
			</Button>
		</form>
	</Dialog.Content>
</Dialog.Root>
