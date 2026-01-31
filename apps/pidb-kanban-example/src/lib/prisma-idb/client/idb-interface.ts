import type { DBSchema } from "idb";
import type * as Prisma from "./generated/client";
import type { PushResult } from "../server/batch-processor";

export interface PrismaIDBSchema extends DBSchema {
  Board: {
    key: [id: Prisma.Board["id"]];
    value: Prisma.Board;
  };
  Todo: {
    key: [id: Prisma.Todo["id"]];
    value: Prisma.Todo;
  };
  User: {
    key: [id: Prisma.User["id"]];
    value: Prisma.User;
    indexes: {
      emailIndex: [email: Prisma.User["email"]];
    };
  };
  OutboxEvent: {
    key: [id: string];
    value: OutboxEventRecord;
  };
  VersionMeta: {
    key: [model: string, key: IDBValidKey];
    value: ChangeMetaRecord;
  };
}
export interface OutboxEventRecord {
  id: string;
  entityType: string;
  operation: "create" | "update" | "delete";
  payload: unknown;
  createdAt: Date;
  tries: number;
  lastError: string | null;
  synced: boolean;
  syncedAt: Date | null;
  lastAttemptedAt: Date | null;
  retryable: boolean;
}
export interface ChangeMetaRecord {
  model: string;
  key: IDBValidKey;
  lastAppliedChangeId: string | null;
  localChangePending: boolean;
}
export interface SyncWorkerOptions {
  syncHandler: (events: OutboxEventRecord[]) => Promise<PushResult[]>;
  batchSize?: number;
  intervalMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
}
export interface SyncWorkerStatus {
  /** Whether the worker is looping */
  isLooping: boolean;
  /** Current status of the sync worker */
  status: "STOPPED" | "IDLE" | "PUSHING" | "PULLING";
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
   * Force an immediate sync cycle while worker is running.
   * Returns immediately if worker is stopped or a sync is already in progress.
   * Use syncNow() to trigger a one-off sync without starting the worker.
   */
  forceSync(): Promise<void>;
  /**
   * Execute a single sync cycle immediately without starting the worker.
   * Returns immediately if a sync is already in progress.
   * Does not require the worker to be running (started).
   */
  syncNow(): Promise<void>;
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
  on(event: "statuschange", callback: () => void): () => void;
}
