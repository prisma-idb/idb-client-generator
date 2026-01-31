import { DMMF } from "@prisma/generator-helper";
import { getUniqueIdentifiers } from "../../helpers/utils";
import { Model } from "../types";
import CodeBlockWriter from "code-block-writer";

export function createIDBInterfaceFile(
  writer: CodeBlockWriter,
  models: DMMF.Datamodel["models"],
  prismaClientImport: string,
  outboxSync: boolean,
  outboxModelName: string,
  versionMetaModelName: string
) {
  writer.writeLine(`import type { DBSchema } from "idb";`);
  writer.writeLine(`import type * as Prisma from "${prismaClientImport}";`);
  if (outboxSync) {
    writer.writeLine(`import type { PushResult } from "../server/batch-processor";`);
    writer.writeLine(`import type { ApplyPullResult } from "./apply-pull";`);
  }
  writer.blankLine();

  writer.writeLine(`export interface PrismaIDBSchema extends DBSchema`).block(() => {
    models.forEach((model) => {
      writer.writeLine(`${model.name}: `).block(() => {
        const uniqueIdentifiers = getUniqueIdentifiers(model);
        const primaryIdentifier = uniqueIdentifiers[0];

        writer.writeLine(`key: ${primaryIdentifier.keyPathType};`);
        writer.writeLine(`value: Prisma.${model.name};`);

        createUniqueFieldIndexes(writer, model);
      });
    });

    if (outboxSync) {
      writer.writeLine(`${outboxModelName}: `).block(() => {
        writer.writeLine(`key: [id: string];`);
        writer.writeLine(`value: OutboxEventRecord;`);
      });
      writer.writeLine(`${versionMetaModelName}: `).block(() => {
        writer.writeLine(`key: [model: string, key: IDBValidKey];`);
        writer.writeLine(`value: ChangeMetaRecord;`);
      });
    }
  });

  // Add type definition for OutboxEventRecord
  if (outboxSync) {
    addOutboxEventTypeDefinition(writer);
    addSyncWorkerTypes(writer);
  }
}

function createUniqueFieldIndexes(writer: CodeBlockWriter, model: Model) {
  const nonKeyUniqueIdentifiers = getUniqueIdentifiers(model).slice(1);
  if (nonKeyUniqueIdentifiers.length === 0) return;

  writer.writeLine("indexes: ").block(() => {
    nonKeyUniqueIdentifiers.forEach(({ name, keyPathType }) => {
      writer.writeLine(`${name}Index: ${keyPathType}`);
    });
  });
}

function addOutboxEventTypeDefinition(writer: CodeBlockWriter) {
  writer.writeLine(`export interface OutboxEventRecord`).block(() => {
    writer
      .writeLine(`id: string;`)
      .writeLine(`entityType: string;`)
      .writeLine(`operation: "create" | "update" | "delete";`)
      .writeLine(`payload: unknown;`)
      .writeLine(`createdAt: Date;`)
      .writeLine(`tries: number;`)
      .writeLine(`lastError: string | null;`)
      .writeLine(`synced: boolean;`)
      .writeLine(`syncedAt: Date | null;`)
      .writeLine(`lastAttemptedAt: Date | null;`)
      .writeLine(`retryable: boolean;`);
  });

  writer.writeLine(`export interface ChangeMetaRecord`).block(() => {
    writer
      .writeLine(`model: string;`)
      .writeLine(`key: IDBValidKey;`)
      .writeLine(`lastAppliedChangeId: string | null;`)
      .writeLine(`localChangePending: boolean;`);
  });
}

function addSyncWorkerTypes(writer: CodeBlockWriter) {
  writer.writeLine(`export interface SyncWorkerOptions`).block(() => {
    writer
      .writeLine(`syncHandler: (events: OutboxEventRecord[]) => Promise<PushResult[]>;`)
      .writeLine(`batchSize?: number;`)
      .writeLine(`intervalMs?: number;`)
      .writeLine(`maxRetries?: number;`)
      .writeLine(`backoffBaseMs?: number;`);
  });

  writer.writeLine(`export interface SyncWorkerStatus`).block(() => {
    writer
      .writeLine(`/** Whether the worker is looping */`)
      .writeLine(`isLooping: boolean;`)
      .writeLine(`/** Current status of the sync worker */`)
      .writeLine(`status: 'STOPPED' | 'IDLE' | 'PUSHING' | 'PULLING';`)
      .writeLine(`/** Timestamp of the last successful sync completion */`)
      .writeLine(`lastSyncTime: Date | null;`)
      .writeLine(`/** The last error encountered during sync, if any */`)
      .writeLine(`lastError: Error | null;`);
  });

  writer.writeLine(`export interface SyncWorker`).block(() => {
    writer
      .writeLine(`/**`)
      .writeLine(` * Start the sync worker.`)
      .writeLine(` * Begins sync cycles at the configured interval.`)
      .writeLine(` * Does nothing if already running.`)
      .writeLine(` */`)
      .writeLine(`start(): void;`)
      .writeLine(`/**`)
      .writeLine(` * Stop the sync worker.`)
      .writeLine(` * Stops scheduling new sync cycles.`)
      .writeLine(` * Any in-progress sync will complete before fully stopping.`)
      .writeLine(` */`)
      .writeLine(`stop(): void;`)
      .writeLine(`/**`)
      .writeLine(` * Force an immediate sync cycle while worker is running.`)
      .writeLine(` * Returns immediately if worker is stopped or a sync is already in progress.`)
      .writeLine(` * Use syncNow() to trigger a one-off sync without starting the worker.`)
      .writeLine(` */`)
      .writeLine(`forceSync(options?: { overrideBackoff?: boolean }): Promise<void>;`)
      .writeLine(`/**`)
      .writeLine(` * Execute a single sync cycle immediately without starting the worker.`)
      .writeLine(` * Returns immediately if a sync is already in progress.`)
      .writeLine(` * Does not require the worker to be running (started).`)
      .writeLine(` */`)
      .writeLine(`syncNow(options?: { overrideBackoff?: boolean }): Promise<void>;`)
      .writeLine(`/**`)
      .writeLine(` * Get current sync worker status snapshot.`)
      .writeLine(` * Listen to 'statuschange' events via .on() to get updates.`)
      .writeLine(` */`)
      .writeLine(`readonly status: SyncWorkerStatus;`)
      .writeLine(`/**`)
      .writeLine(` * Listen for status changes.`)
      .writeLine(` * @param event Event name ('statuschange' or 'pullcompleted')`)
      .writeLine(` * @param callback Function called whenever the event fires`)
      .writeLine(` * @returns Unsubscribe function`)
      .writeLine(` * @example`)
      .writeLine(` * const unsubscribe = worker.on('statuschange', (e) => {`)
      .writeLine(` *   console.log('Status:', worker.status);`)
      .writeLine(` * });`)
      .writeLine(` * // Later: unsubscribe()`)
      .writeLine(` */`)
      .writeLine(
        `on(event: 'statuschange' | 'pullcompleted', callback: (e: Event | CustomEvent<ApplyPullResult>) => void): () => void;`
      );
  });
}
