import type { Prisma } from '$lib/generated/prisma/client';
import type { SyncWorker } from '$lib/prisma-idb/client/idb-interface';
import { PrismaIDBClient } from '$lib/prisma-idb/client/prisma-idb-client';
import { applyPull } from '$lib/prisma-idb/client/apply-pull';
import type { LogWithRecord } from './prisma-idb/server/batch-processor';
import type { validators } from './prisma-idb/validators';

export class AppState {
	client = $state<PrismaIDBClient>();
	userId = $state<string>();
	currentUser = $state<Prisma.UserGetPayload<{ select: { id: true; name: true } }> | null>(null);
	allUsers = $state<Prisma.UserGetPayload<{ select: { id: true; name: true } }>[]>([]);
	todos = $state<Prisma.TodoGetPayload<{ select: { id: true; title: true; completed: true } }>[]>(
		[]
	);
	newTodoTitle = $state('');
	newUserName = $state('');
	isLoading = $state(false);
	isCreatingUser = $state(false);
	syncWorker = $state<SyncWorker | null>(null);
	syncStats = $state<{ unsynced: number; failed: number; lastError?: string }>({
		unsynced: 0,
		failed: 0
	});
	showSyncDetails = $state(false);
	clearingSynced = $state(false);
	activeTab = $state<'users' | 'todos' | 'sync' | 'pull'>('users');
	pullCursor = $state<number | undefined>(undefined);

	constructor() {
		// Load cursor from localStorage on initialization
		if (typeof window !== 'undefined') {
			const savedCursor = localStorage.getItem('pullCursor');
			if (savedCursor) {
				this.pullCursor = parseInt(savedCursor, 10);
			}
		}
	}

	savePullCursor(cursor: number | undefined) {
		this.pullCursor = cursor;
		if (typeof window !== 'undefined') {
			if (cursor !== undefined) {
				localStorage.setItem('pullCursor', cursor.toString());
			} else {
				localStorage.removeItem('pullCursor');
			}
		}
	}

	clearPullCursor() {
		this.savePullCursor(undefined);
	}

	async initializeClient() {
		this.client = await PrismaIDBClient.createClient();
		await this.loadAllUsers();
		await this.loadCurrentUser();
		await this.loadTodos();
		await this.loadSyncStats();

		// Subscribe to todo changes
		this.client.todo.subscribe(['create', 'delete', 'update'], async () => {
			await this.loadTodos();
			await this.loadSyncStats();
		});

		// Subscribe to user changes
		this.client.user.subscribe(['create', 'update', 'delete'], async () => {
			await this.loadAllUsers();
			await this.loadCurrentUser();
			await this.loadSyncStats();
		});
	}

	async loadSyncStats() {
		if (!this.client) return;
		try {
			this.syncStats = await this.client.$outbox.stats();
		} catch (error) {
			console.error('Error loading sync stats:', error);
		}
	}

	stopSync() {
		if (this.syncWorker) {
			this.syncWorker.stop();
			this.syncWorker = null;
		}
	}

	async loadAllUsers() {
		if (!this.client) return;
		try {
			const users = await this.client.user.findMany({
				select: { id: true, name: true }
			});
			this.allUsers = users;
		} catch (error) {
			console.error('Error loading users:', error);
		}
	}

	async loadCurrentUser() {
		if (!this.client) return;
		try {
			const user = await this.client.user.findUnique({
				where: { id: this.userId },
				select: { id: true, name: true }
			});
			this.currentUser = user;
		} catch (error) {
			console.error('Error loading user:', error);
		}
	}

	async loadTodos() {
		if (!this.client) return;
		try {
			const result = await this.client.todo.findMany({
				where: { userId: this.userId },
				select: { id: true, title: true, completed: true }
			});
			this.todos = result;
		} catch (error) {
			console.error('Error loading todos:', error);
		}
	}

	async selectUser(userId: string) {
		this.userId = userId;
		await this.loadCurrentUser();
		await this.loadTodos();
	}

	async createUser(name: string) {
		if (!this.client || !name.trim()) {
			throw new Error('Please enter a user name');
		}

		this.isCreatingUser = true;
		try {
			await this.client.user.create({
				data: {
					name: name.trim()
				}
			});
			this.newUserName = '';
			await this.loadAllUsers();
		} finally {
			this.isCreatingUser = false;
		}
	}

	async addTodo(title: string) {
		if (!this.userId) {
			throw new Error('No user selected');
		}
		if (!this.client || !title.trim()) {
			throw new Error('Please enter a todo title');
		}

		this.isLoading = true;
		try {
			await this.client.todo.create({
				data: {
					title: title.trim(),
					completed: false,
					userId: this.userId
				}
			});
			this.newTodoTitle = '';
		} finally {
			this.isLoading = false;
		}
	}

	async toggleTodo(id: string, completed: boolean) {
		if (!this.client) return;
		try {
			await this.client.todo.update({
				where: { id },
				data: { completed: !completed }
			});
		} catch (error) {
			console.error('Error updating todo:', error);
			throw error;
		}
	}

	async deleteTodo(id: string) {
		if (!this.client) return;
		try {
			await this.client.todo.delete({
				where: { id }
			});
		} catch (error) {
			console.error('Error deleting todo:', error);
			throw error;
		}
	}

	setSyncWorker(worker: SyncWorker | null) {
		this.syncWorker = worker;
	}

	async clearSyncedEvents() {
		if (!this.client) return;
		try {
			this.clearingSynced = true;
			const deletedCount = await this.client.$outbox.clearSynced({ olderThanDays: 7 });
			await this.loadSyncStats();
			return deletedCount;
		} finally {
			this.clearingSynced = false;
		}
	}

	async retrySyncedFailed() {
		if (!this.client) return;
		try {
			this.isLoading = true;
			const batch = await this.client.$outbox.getNextBatch({ limit: 100 });
			const failedEvents = batch.filter((e) => e.lastError !== null && e.lastError !== undefined);

			if (failedEvents.length === 0) {
				return 0;
			}

			// Reset tries count for failed events by marking them as unsynced
			const tx = this.client._db.transaction('OutboxEvent', 'readwrite');
			const store = tx.objectStore('OutboxEvent');

			for (const event of failedEvents) {
				await store.put({
					...event,
					tries: 0,
					lastError: null
				});
			}

			await tx.done;
			await this.loadSyncStats();
			return failedEvents.length;
		} finally {
			this.isLoading = false;
		}
	}

	getActiveTabCount(tab: string): number {
		switch (tab) {
			case 'users':
				return this.allUsers.length;
			case 'todos':
				return this.todos.length;
			case 'sync':
				return this.syncStats.unsynced + this.syncStats.failed;
			default:
				return 0;
		}
	}

	getActiveTodoCount(): number {
		return this.todos.filter((t) => !t.completed).length;
	}

	getCompletedTodoCount(): number {
		return this.todos.filter((t) => t.completed).length;
	}

	async clearDatabaseAndRefresh() {
		if (!this.client) return;
		try {
			this.isLoading = true;
			await this.client.resetDatabase();

			// Refresh all state
			await Promise.all([
				this.loadAllUsers(),
				this.loadCurrentUser(),
				this.loadTodos(),
				this.loadSyncStats()
			]);
		} finally {
			this.isLoading = false;
		}
	}

	async pullChangesAndRefresh(
		pullChangesFunc: (params: { scopeKey?: string; since?: number }) => Promise<{
			cursor: number | bigint | undefined;
			logsWithRecords: LogWithRecord<typeof validators>[];
		}>,
		scopeKey?: string
	): Promise<{ totalAppliedRecords: number; cursor: number | undefined }> {
		if (!this.client) throw new Error('Client not initialized');

		try {
			this.isLoading = true;

			const { cursor, logsWithRecords } = await pullChangesFunc({
				scopeKey,
				since: this.pullCursor
			});

			const { totalAppliedRecords } = await applyPull(this.client, logsWithRecords);

			// Save the cursor for next pull (convert bigint to number if needed)
			const cursorValue =
				cursor !== undefined ? (typeof cursor === 'bigint' ? Number(cursor) : cursor) : undefined;
			this.savePullCursor(cursorValue);

			// Refresh all state
			await Promise.all([
				this.loadAllUsers(),
				this.loadCurrentUser(),
				this.loadTodos(),
				this.loadSyncStats()
			]);

			return { totalAppliedRecords, cursor: cursorValue };
		} finally {
			this.isLoading = false;
		}
	}
}

export function createAppState() {
	return new AppState();
}
