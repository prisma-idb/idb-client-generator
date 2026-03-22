import { DMMF } from "@prisma/generator-helper";
import CodeBlockWriter from "code-block-writer";
import type { Model } from "../types";
import { addBaseModelClass } from "./classes/BaseIDBModelClass";
import { addIDBModelClass } from "./classes/models/IDBModelClass";
import { addClientClass } from "./classes/PrismaIDBClient";
import { addOutboxEventIDBClass } from "./classes/OutboxEventIDBClass";
import { addVersionMetaIDBClass } from "./classes/VersionMetaIDBClass";

export interface MigrationInfo {
  currentVersion: number;
  schemaHash: string;
  migrationFolderNames: string[];
  dropDbOnSchemaVersionMismatch: boolean;
}

function addImports(
  writer: CodeBlockWriter,
  models: readonly Model[],
  prismaClientImport: string,
  outboxSync: boolean = false,
  migrationInfo?: MigrationInfo
) {
  writer
    .writeLine("/* eslint-disable @typescript-eslint/no-unused-vars */")
    .writeLine(`import { openDB, deleteDB } from "idb";`)
    .writeLine(`import type { IDBPDatabase, StoreNames, IDBPTransaction } from "idb";`)
    .writeLine(`import type { Prisma } from "${prismaClientImport}";`)
    .writeLine(`import * as IDBUtils from "./idb-utils";`);

  if (outboxSync) {
    writer
      .writeLine(
        `import type { OutboxEventRecord, ChangeMetaRecord, PrismaIDBSchema, SyncWorkerOptions, SyncWorker } from "./idb-interface";`
      )
      .writeLine(`import type { PushResult } from "../server/batch-processor";`)
      .writeLine(`import { validators, keyPathValidators, modelRecordToKeyPath } from "../validators";`)
      .writeLine(`import type { LogWithStringifiedRecord } from '../server/batch-processor';`)
      .writeLine(`import { applyPull, type ApplyPullResult } from './apply-pull';`);
  } else {
    writer.writeLine(`import type { PrismaIDBSchema } from "./idb-interface";`);
  }

  // Always import schema hash for drift detection
  writer.writeLine(`import { IDB_SCHEMA_HASH } from "./idb-schema-hash";`);

  // Import migration functions if migrations exist
  if (migrationInfo && migrationInfo.currentVersion > 0) {
    for (let i = 0; i < migrationInfo.migrationFolderNames.length; i++) {
      const folderName = migrationInfo.migrationFolderNames[i];
      writer.writeLine(`import { migrate as migrateV${i + 1} } from "./migrations/${folderName}/migration";`);
    }
  }

  const cuidFieldExists = models
    .flatMap((model) => model.fields)
    .some((field) => typeof field.default === "object" && "name" in field.default && field.default.name == "cuid");

  if (cuidFieldExists) writer.writeLine(`import { createId } from "@paralleldrive/cuid2";`);

  const uuidFieldExists = models
    .flatMap((model) => model.fields)
    .some((field) => typeof field.default === "object" && "name" in field.default && field.default.name == "uuid");

  if (uuidFieldExists) writer.writeLine(`import { v4 as uuidv4 } from "uuid";`);
}

function addVersionDeclaration(writer: CodeBlockWriter, migrationInfo?: MigrationInfo) {
  if (migrationInfo && migrationInfo.currentVersion > 0) {
    writer.writeLine(`const CURRENT_VERSION = ${migrationInfo.currentVersion};`);
  } else {
    writer.writeLine(`const IDB_VERSION = 1;`);
  }
  writer.writeLine(
    `const DROP_DB_ON_SCHEMA_VERSION_MISMATCH = ${migrationInfo?.dropDbOnSchemaVersionMismatch ?? false};`
  );
}

export interface CreatePrismaIDBClientFileOptions {
  models: DMMF.Datamodel["models"];
  prismaClientImport: string;
  outboxSync: boolean;
  outboxModelName: string;
  versionMetaModelName: string;
  include?: string[];
  exclude?: string[];
  migrationInfo?: MigrationInfo;
}

export function createPrismaIDBClientFile(writer: CodeBlockWriter, options: CreatePrismaIDBClientFileOptions) {
  const {
    models,
    prismaClientImport,
    outboxSync,
    outboxModelName,
    versionMetaModelName,
    include = ["*"],
    exclude = [],
    migrationInfo,
  } = options;
  addImports(writer, models, prismaClientImport, outboxSync, migrationInfo);
  addVersionDeclaration(writer, migrationInfo);
  addClientClass(writer, models, outboxSync, outboxModelName, versionMetaModelName, include, exclude, migrationInfo);
  addBaseModelClass(writer, outboxSync);
  models.forEach((model) => {
    addIDBModelClass(writer, model, models, outboxSync, outboxModelName, versionMetaModelName);
  });
  if (outboxSync) {
    addOutboxEventIDBClass(writer, outboxModelName);
    addVersionMetaIDBClass(writer, versionMetaModelName);
  }
}
