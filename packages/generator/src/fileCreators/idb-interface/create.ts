import { DMMF } from "@prisma/generator-helper";
import { CodeBlockWriter, SourceFile } from "ts-morph";
import { getUniqueIdentifiers } from "../../helpers/utils";
import { Model } from "../types";

export function createIDBInterfaceFile(
  idbInterfaceFile: SourceFile,
  models: DMMF.Datamodel["models"],
  prismaClientImport: string,
  outboxSync: boolean = false,
  outboxModelName: string = "OutboxEvent",
) {
  idbInterfaceFile.addImportDeclaration({ isTypeOnly: true, namedImports: ["DBSchema"], moduleSpecifier: "idb" });
  idbInterfaceFile.addImportDeclaration({ namespaceImport: "Prisma", moduleSpecifier: prismaClientImport });

  idbInterfaceFile.addInterface({
    name: "PrismaIDBSchema",
    extends: ["DBSchema"],
    isExported: true,
    properties: [
      ...models.map((model) => ({
        name: model.name,
        type: (writer: CodeBlockWriter) => {
          writer.block(() => {
            writer
              .writeLine(`key: ${getUniqueIdentifiers(model)[0].keyPathType};`)
              .writeLine(`value: Prisma.${model.name};`);
            createUniqueFieldIndexes(writer, model);
          });
        },
      })),
      ...(outboxSync
        ? [
            {
              name: outboxModelName,
              type: (writer: CodeBlockWriter) => {
                writer.block(() => {
                  writer
                    .writeLine(`key: [id: string];`)
                    .writeLine(`value: OutboxEventRecord;`);
                });
              },
            },
          ]
        : []),
    ],
  });

  // Add type definition for OutboxEvent record
  if (outboxSync) {
    addOutboxEventTypeDefinition(idbInterfaceFile, outboxModelName);
    addSyncWorkerTypes(idbInterfaceFile);
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

function addOutboxEventTypeDefinition(idbInterfaceFile: SourceFile, outboxModelName: string) {
  idbInterfaceFile.addTypeAlias({
    name: "OutboxEventRecord",
    isExported: true,
    type: (writer) => {
      writer.block(() => {
        writer
          .writeLine(`id: string;`)
          .writeLine(`entityType: string;`)
          .writeLine(`entityId: string | null;`)
          .writeLine(`operation: "create" | "update" | "delete";`)
          .writeLine(`payload: unknown;`)
          .writeLine(`clientMeta?: unknown;`)
          .writeLine(`createdAt: Date;`)
          .writeLine(`tries: number;`)
          .writeLine(`lastError: string | null;`)
          .writeLine(`synced: boolean;`)
          .writeLine(`syncedAt: Date | null;`)
      });
    },
  });
}

function addSyncWorkerTypes(idbInterfaceFile: SourceFile) {
  idbInterfaceFile.addTypeAlias({
    name: "AppliedResult",
    isExported: true,
    type: (writer) => {
      writer.block(() => {
        writer
          .writeLine(`id: string;`)
          .writeLine(`entityId?: string | null;`)
          .writeLine(`mergedRecord?: Record<string, any>;`)
          .writeLine(`serverVersion?: number | string;`)
          .writeLine(`error?: string | null;`);
      });
    },
  });

  idbInterfaceFile.addTypeAlias({
    name: "SyncWorkerOptions",
    isExported: true,
    type: (writer) => {
      writer.block(() => {
        writer
          .writeLine(`syncHandler: (events: OutboxEventRecord[]) => Promise<AppliedResult[]>;`)
          .writeLine(`batchSize?: number;`)
          .writeLine(`intervalMs?: number;`)
          .writeLine(`maxRetries?: number;`)
          .writeLine(`backoffBaseMs?: number;`);
      });
    },
  });

  idbInterfaceFile.addTypeAlias({
    name: "SyncWorker",
    isExported: true,
    type: (writer) => {
      writer.block(() => {
        writer
          .writeLine(`start(): void;`)
          .writeLine(`stop(): void;`);
      });
    },
  });
}
