import { browser } from '$app/environment';
import { client } from '$lib/clients/idb-client';
import { toast } from 'svelte-sonner';
import { createContext } from 'svelte';
import type { Prisma } from '$lib/generated/prisma/client';
import type { SyncWorker } from '$lib/generated/prisma-idb/client/idb-interface';
import { syncPull, syncPush } from './data.remote';

export class TodosState {
	boards = $state<Prisma.BoardGetPayload<{ include: { todos: true } }>[]>();

	isSyncing = $state(false);
	syncWorker = $state<SyncWorker | null>(null);

	constructor() {
		if (browser) this.loadBoards();
	}

	getCursor() {
		if (!browser) throw new Error('Not in browser environment');
		const lastSyncedAt = localStorage.getItem('lastSyncedAt');
		return lastSyncedAt ? Number(lastSyncedAt) : null;
	}

	setCursor(cursor: number | undefined) {
		if (!browser) throw new Error('Not in browser environment');
		if (cursor) {
			localStorage.setItem('lastSyncedAt', cursor.toString());
		} else {
			localStorage.removeItem('lastSyncedAt');
		}
	}

	async loadBoards() {
		this.boards = await client.board.findMany({ include: { todos: true } });
	}

	async addBoard(name: string) {
		const newBoard = await client.board.create({
			data: { name }
		});
		this.boards?.push({ ...newBoard, todos: [] });
	}

	async deleteBoard(boardId: string) {
		await client.board.delete({ where: { id: boardId } });
		this.boards = this.boards?.filter((b) => b.id !== boardId);
	}

	async addTodoToBoard(boardId: string, title: string) {
		const currentUser = await client.user.findFirstOrThrow();

		const newTodo = await client.todo.create({
			data: { title, boardId, userId: currentUser.id }
		});

		const board = this.boards?.find((b) => b.id === boardId);
		board?.todos.push(newTodo);
	}

	async syncWithServer() {
		if (!client) return;
		try {
			this.isSyncing = true;

			const syncWorker = client.createSyncWorker({
				push: {
					handler: (events) => syncPush(events),
					batchSize: 50
				},
				pull: {
					handler: (cursor) => syncPull({ since: cursor }),
					getCursor: () => this.getCursor(),
					setCursor: (cursor) => this.setCursor(cursor)
				},
				schedule: {
					intervalMs: 10000,
					maxRetries: 3
				}
			});

			this.syncWorker = syncWorker;
			syncWorker.start();
			toast.success('Sync started! Processing outbox events...');
		} catch (error) {
			console.error('Error starting sync worker:', error);
			toast.error('Failed to start sync worker');
			this.syncWorker = null;
		} finally {
			this.isSyncing = false;
		}
	}
}

export const [getTodosContext, setTodosContext] = createContext<TodosState>();
