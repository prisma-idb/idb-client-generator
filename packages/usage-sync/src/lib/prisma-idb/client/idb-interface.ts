import type { DBSchema } from 'idb';
import type * as Prisma from '$lib/generated/prisma/client';
export interface PrismaIDBSchema extends DBSchema {
	User: {
		key: [id: Prisma.User['id']];
		value: Prisma.User;
	};
	Todo: {
		key: [id: Prisma.Todo['id']];
		value: Prisma.Todo;
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
	entityKeyPath: PrismaIDBSchema[keyof PrismaIDBSchema]['key'];
	mergedRecord?: Record<string, any>;
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
export interface SyncWorker {
	start(): void;
	stop(): void;
}
