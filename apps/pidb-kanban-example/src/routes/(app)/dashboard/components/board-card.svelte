<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card/index.js';
	import { MenuIcon, PencilIcon, PlusCircleIcon, TrashIcon } from '@lucide/svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Item from '$lib/components/ui/item/index.js';
	import type { Prisma, Todo } from '$lib/generated/prisma/client';
	import { getTodosContext } from '../../todos-state.svelte';
	import RenameBoardDialog from './rename-board-dialog.svelte';
	import TodoDialog from './todo-dialog.svelte';

	const todosState = getTodosContext();
	let { board }: { board: Prisma.BoardGetPayload<{ include: { todos: true } }> } = $props();

	let openRenameDialog = $state(false);
	let todoDialogConfig = $state<{ open: boolean; action: 'create' | 'edit'; todo?: Todo }>({
		open: false,
		action: 'create'
	});
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{board.name}</Card.Title>
		<Card.Action>
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Button
							size="icon-sm"
							variant="secondary"
							data-testid={`board-menu-${board.name}`}
							{...props}
						>
							<MenuIcon />
						</Button>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Group>
						<DropdownMenu.Item
							onclick={() => (todoDialogConfig = { open: true, action: 'create', todo: undefined })}
							data-testid={`add-todo-${board.name}`}
						>
							<PlusCircleIcon /> Add todo
						</DropdownMenu.Item>
						<DropdownMenu.Item
							data-testid={`rename-${board.name}`}
							onclick={() => (openRenameDialog = true)}
						>
							<PencilIcon /> Rename
						</DropdownMenu.Item>
						<DropdownMenu.Item
							class="text-destructive"
							onclick={() => todosState.deleteBoard(board.id)}
							data-testid={`delete-board-${board.name}`}
						>
							<TrashIcon /> Delete
						</DropdownMenu.Item>
					</DropdownMenu.Group>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</Card.Action>
	</Card.Header>
	<Card.Content class="flex flex-col gap-2">
		{#each board.todos as todo (todo.id)}
			<Item.Root class="rounded-md border border-secondary">
				<Item.Content>
					<Item.Title>{todo.title}</Item.Title>
					{#if todo.description}
						<Item.Description>{todo.description}</Item.Description>
					{/if}
				</Item.Content>
			</Item.Root>
		{/each}
	</Card.Content>
</Card.Root>

<RenameBoardDialog {board} bind:open={openRenameDialog} />
<TodoDialog bind:open={todoDialogConfig.open} action={todoDialogConfig.action} {board} />
