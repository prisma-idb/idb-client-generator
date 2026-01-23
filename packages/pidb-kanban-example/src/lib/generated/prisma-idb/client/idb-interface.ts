import type { DBSchema } from 'idb';
import type * as Prisma from '../../prisma/client';
export interface PrismaIDBSchema extends DBSchema {
	Todo: {
		key: [id: Prisma.Todo['id']];
		value: Prisma.Todo;
	};
	Board: {
		key: [id: Prisma.Board['id']];
		value: Prisma.Board;
	};
	User: {
		key: [id: Prisma.User['id']];
		value: Prisma.User;
		indexes: {
			emailIndex: [email: Prisma.User['email']];
		};
	};
	Session: {
		key: [id: Prisma.Session['id']];
		value: Prisma.Session;
		indexes: {
			tokenIndex: [token: Prisma.Session['token']];
		};
	};
	Account: {
		key: [id: Prisma.Account['id']];
		value: Prisma.Account;
	};
	Verification: {
		key: [id: Prisma.Verification['id']];
		value: Prisma.Verification;
	};
	OutboxEvent: {
		key: [id: string];
		value: OutboxEventRecord;
	};
}
export interface OutboxEventRecord {
	id: string;
	entityType: string;
	entityKeyPath: Array<string | number>;
	operation: 'create' | 'update' | 'delete';
	payload: unknown;
	clientMeta?: unknown;
	createdAt: Date;
	tries: number;
	lastError: string | null;
	synced: boolean;
	syncedAt: Date | null;
}
export interface AppliedResult {
	id: string;
	entityKeyPath: Array<string | number>;
	mergedRecord?: unknown;
	serverVersion?: number | string;
	error?: string | null;
}
export interface SyncWorkerOptions {
	syncHandler: (events: OutboxEventRecord[]) => Promise<AppliedResult[]>;
	batchSize?: number;
	intervalMs?: number;
	maxRetries?: number;
	backoffBaseMs?: number;
}
export interface SyncWorkerStatus {
	/** Whether the worker is currently active (started) */
	isRunning: boolean;
	/** Whether a sync cycle is currently in progress */
	isProcessing: boolean;
	/** Whether the push phase is currently active */
	isPushing: boolean;
	/** Whether the pull phase is currently active */
	isPulling: boolean;
	/** Timestamp of the last successful sync completion */
	lastSyncTime: Date | null;
	/** The last error encountered during sync, if any */
	lastError: Error | null;
}
export interface SyncWorker {
	/**
	 * Start the sync worker.
	 * Begins sync cycles at the configured interval.
	 * Does nothing if already running.
	 */
	start(): void;
	/**
	 * Stop the sync worker.
	 * Stops scheduling new sync cycles.
	 * Any in-progress sync will complete before fully stopping.
	 */
	stop(): void;
	/**
	 * Force an immediate sync cycle.
	 * Returns immediately if a sync is already in progress.
	 */
	forceSync(): Promise<void>;
	/**
	 * Get current sync worker status snapshot.
	 * Listen to 'statuschange' events via .on() to get updates.
	 */
	readonly status: SyncWorkerStatus;
	/**
	 * Listen for status changes.
	 * @param event Event name (only 'statuschange' supported)
	 * @param callback Function called whenever status changes
	 * @returns Unsubscribe function
	 * @example
	 * const unsubscribe = worker.on('statuschange', () => {
	 *   console.log('Status:', worker.status);
	 * });
	 * // Later: unsubscribe()
	 */
	on(event: 'statuschange', callback: () => void): () => void;
}
