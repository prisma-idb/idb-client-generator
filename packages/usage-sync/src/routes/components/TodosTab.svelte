<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import { Input } from '$lib/components/ui/input';
	import type { AppState } from '$lib/store.svelte';
	import { CheckCircle2, Circle, Trash2 } from '@lucide/svelte';
	import { toast } from 'svelte-sonner';

	type PropsType = {
		appState: AppState;
	};

	let { appState }: PropsType = $props();

	async function handleAddTodo(e: SubmitEvent) {
		e.preventDefault();
		try {
			await appState.addTodo(appState.newTodoTitle);
			toast.success('Todo added!');
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : 'Failed to add todo';
			toast.error(errorMsg);
		}
	}

	async function handleToggleTodo(id: string, completed: boolean) {
		try {
			await appState.toggleTodo(id, completed);
			toast.success('Todo updated!');
		} catch {
			toast.error('Failed to update todo');
		}
	}

	async function handleDeleteTodo(id: string) {
		try {
			await appState.deleteTodo(id);
			toast.success('Todo deleted!');
		} catch {
			toast.error('Failed to delete todo');
		}
	}
</script>

{#if !appState.userId}
	<div class="rounded-lg border border-amber-200 bg-amber-50 p-4">
		<p class="text-sm text-amber-900">Please select a user first in the Users tab</p>
	</div>
{:else}
	<div class="space-y-4">
		<!-- Add Todo Form -->
		<div class="rounded-lg border p-6">
			<h2 class="mb-4 text-lg font-semibold">Add Todo</h2>
			<form onsubmit={handleAddTodo} class="flex gap-2">
				<div class="flex-1">
					<Input
						type="text"
						placeholder="What needs to be done?"
						value={appState.newTodoTitle}
						onchange={(e) => (appState.newTodoTitle = (e.target as HTMLInputElement).value)}
						disabled={appState.isLoading || !appState.client}
						class="w-full"
					/>
				</div>
				<Button
					type="submit"
					disabled={appState.isLoading || !appState.client || !appState.newTodoTitle.trim()}
				>
					{appState.isLoading ? 'Adding...' : 'Add'}
				</Button>
			</form>
		</div>

		<!-- Todo Stats -->
		<div class="grid grid-cols-2 gap-4">
			<div class="rounded-lg border p-4 text-center">
				<div class="text-2xl font-bold">{appState.getActiveTodoCount()}</div>
				<div class="text-xs text-muted-foreground">Active</div>
			</div>
			<div class="rounded-lg border p-4 text-center">
				<div class="text-2xl font-bold">{appState.getCompletedTodoCount()}</div>
				<div class="text-xs text-muted-foreground">Completed</div>
			</div>
		</div>

		<!-- Todo List -->
		<div class="rounded-lg border p-6">
			<h2 class="mb-4 text-lg font-semibold">Todos for {appState.currentUser?.name}</h2>
			{#if appState.todos.length === 0}
				<div class="flex items-center justify-center rounded-lg bg-muted/50 py-8">
					<p class="text-sm text-muted-foreground">No todos yet. Add one to get started!</p>
				</div>
			{:else}
				<div class="space-y-2">
					{#each appState.todos as todo (todo.id)}
						<div
							class="flex items-center gap-3 rounded-md border p-3 transition-colors hover:bg-accent"
						>
							<!-- Toggle Complete -->
							<button
								type="button"
								onclick={() => handleToggleTodo(todo.id, todo.completed)}
								class="shrink-0 transition-colors hover:opacity-70"
								title={todo.completed ? 'Mark as incomplete' : 'Mark as complete'}
							>
								{#if todo.completed}
									<CheckCircle2 class="h-5 w-5" />
								{:else}
									<Circle class="h-5 w-5 text-muted-foreground" />
								{/if}
							</button>

							<!-- Title -->
							<div class="flex-1">
								<p class={todo.completed ? 'text-muted-foreground line-through' : ''}>
									{todo.title}
								</p>
							</div>

							<!-- Delete Button -->
							<button
								type="button"
								onclick={() => handleDeleteTodo(todo.id)}
								class="shrink-0 transition-colors hover:text-destructive"
								title="Delete todo"
							>
								<Trash2 class="h-5 w-5" />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>
{/if}
