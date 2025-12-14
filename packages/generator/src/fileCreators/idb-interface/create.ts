import { DMMF } from "@prisma/generator-helper";
import { getUniqueIdentifiers } from "../../helpers/utils";
import { Model } from "../types";
import CodeBlockWriter from "code-block-writer";

export function createIDBInterfaceFile(
  writer: CodeBlockWriter,
  models: DMMF.Datamodel["models"],
  prismaClientImport: string,
  outboxSync: boolean = false,
  outboxModelName: string = "OutboxEvent",
) {
  writer.writeLine(`import type { DBSchema } from "idb";`);
  writer.writeLine(`import type * as Prisma from "${prismaClientImport}";`);

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
    }
  });

  // Add type definition for OutboxEvent record
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
      .writeLine(`entityType: keyof PrismaIDBSchema;`)
      .writeLine(`entityKeyPath: PrismaIDBSchema[keyof PrismaIDBSchema]["key"];`)
      .writeLine(`operation: "create" | "update" | "delete";`)
      .writeLine(`payload: unknown;`)
      .writeLine(`clientMeta?: unknown;`)
      .writeLine(`createdAt: Date;`)
      .writeLine(`tries: number;`)
      .writeLine(`lastError: string | null;`)
      .writeLine(`synced: boolean;`)
      .writeLine(`syncedAt: Date | null;`);
  });
}

function addSyncWorkerTypes(writer: CodeBlockWriter) {
  writer.writeLine(`export interface AppliedResult`).block(() => {
    writer
      .writeLine(`id: string;`)
      .writeLine(`entityKeyPath: PrismaIDBSchema[keyof PrismaIDBSchema]["key"];`)
      .writeLine(`mergedRecord?: Record<string, any>;`)
      .writeLine(`serverVersion?: number | string;`)
      .writeLine(`error?: string | null;`);
  });

  writer.writeLine(`export interface SyncWorkerOptions`).block(() => {
    writer
      .writeLine(`syncHandler: (events: OutboxEventRecord[]) => Promise<AppliedResult[]>;`)
      .writeLine(`batchSize?: number;`)
      .writeLine(`intervalMs?: number;`)
      .writeLine(`maxRetries?: number;`)
      .writeLine(`backoffBaseMs?: number;`);
  });

  writer.writeLine(`export interface SyncWorker`).block(() => {
    writer
      .writeLine(`start(): void;`)
      .writeLine(`stop(): void;`);
  });
}
