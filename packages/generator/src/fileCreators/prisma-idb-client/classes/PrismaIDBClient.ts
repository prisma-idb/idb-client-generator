import CodeBlockWriter from "code-block-writer";
import { getUniqueIdentifiers, toCamelCase as toCamelCaseUtil } from "../../../helpers/utils";
import { Model } from "../../types";
import { shouldTrackModel } from "../../outbox/utils";

export function addClientClass(
  writer: CodeBlockWriter,
  models: readonly Model[],
  outboxSync: boolean = false,
  outboxModelName: string = "OutboxEvent",
  include: string[] = ["*"],
  exclude: string[] = [],
) {
  writer.writeLine(`export class PrismaIDBClient`).block(() => {
    writer
      .writeLine(`private static instance: PrismaIDBClient;`)
      .writeLine(`_db!: IDBPDatabase<PrismaIDBSchema>;`)
      .writeLine(`private outboxEnabled: boolean = ${outboxSync};`)
      .writeLine(`private includedModels: Set<string>;`)
      .blankLine()
      .writeLine(`private constructor() {`)
      .writeLine(
        `this.includedModels = new Set(${JSON.stringify(models.filter((m) => shouldTrackModel(m.name, include, exclude)).map((m) => m.name))});`,
      )
      .writeLine(`}`);

    addModelProperties(writer, models);
    addOutboxProperty(writer, outboxSync, outboxModelName);
    addCreateInstanceMethod(writer);
    addResetDatabaseMethod(writer);
    addShouldTrackModelMethod(writer);
    addToCamelCaseMethod(writer);
    if (outboxSync) {
      addCreateSyncWorkerMethod(writer, outboxModelName);
    }
    addInitializeMethod(writer, models, outboxSync, outboxModelName);
  });
}

function addModelProperties(writer: CodeBlockWriter, models: readonly Model[]) {
  models.forEach((model) => writer.writeLine(`${toCamelCaseUtil(model.name)}!: ${model.name}IDBClass;`));
}

function addOutboxProperty(writer: CodeBlockWriter, outboxSync: boolean, outboxModelName: string) {
  if (!outboxSync) return;
  writer.writeLine(`$outbox!: ${outboxModelName}IDBClass;`);
}

function addCreateInstanceMethod(writer: CodeBlockWriter) {
  writer.writeLine(`public static async createClient(): Promise<PrismaIDBClient>`).block(() => {
    writer
      .writeLine(`if (!PrismaIDBClient.instance)`)
      .block(() => {
        writer
          .writeLine(`const client = new PrismaIDBClient();`)
          .writeLine(`await client.initialize();`)
          .writeLine(`PrismaIDBClient.instance = client;`);
      })
      .writeLine(`return PrismaIDBClient.instance;`);
  });
}

function addInitializeMethod(
  writer: CodeBlockWriter,
  models: readonly Model[],
  outboxSync: boolean = false,
  outboxModelName: string = "OutboxEvent",
) {
  writer.writeLine(`private async initialize()`).block(() => {
    writer
      .writeLine(`this._db = await openDB<PrismaIDBSchema>("prisma-idb", IDB_VERSION, `)
      .block(() => {
        writer.writeLine(`upgrade(db) `).block(() => {
          models.forEach((model) => addObjectStoreInitialization(model, writer));
          if (outboxSync) {
            addOutboxObjectStoreInitialization(writer, outboxModelName);
          }
        });
      })
      .writeLine(`);`);

    models.forEach((model) => {
      writer.writeLine(
        `this.${toCamelCaseUtil(model.name)} = new ${model.name}IDBClass(this, ${getUniqueIdentifiers(model)[0].keyPath});`,
      );
    });

    if (outboxSync) {
      writer.writeLine(
        `this.$outbox = new ${outboxModelName}IDBClass(this, ['id']);`,
      );
    }
  });
}

function addShouldTrackModelMethod(writer: CodeBlockWriter) {
  writer
    .writeLine(`shouldTrackModel(modelName: string): boolean`)
    .block(() => {
      writer.writeLine(`return this.outboxEnabled && this.includedModels.has(modelName);`);
    });
}

function addToCamelCaseMethod(writer: CodeBlockWriter) {
  writer
    .writeLine(`private toCamelCase(str: string): string`)
    .block(() => {
      writer.writeLine(`return str.charAt(0).toLowerCase() + str.slice(1);`);
    });
}

function addCreateSyncWorkerMethod(writer: CodeBlockWriter, outboxModelName: string) {
  writer
    .writeLine(`createSyncWorker(options: { syncHandler: (events: OutboxEventRecord[]) => Promise<AppliedResult[]>; batchSize?: number; intervalMs?: number; maxRetries?: number; backoffBaseMs?: number }): SyncWorker`)
    .block(() => {
      writer
        .writeLine(`const { syncHandler, batchSize = 20, intervalMs = 8000, maxRetries = 5, backoffBaseMs = 1000 } = options;`)
        .blankLine()
        .writeLine(`let intervalId: ReturnType<typeof setInterval> | null = null;`)
        .writeLine(`let isRunning = false;`)
        .blankLine()
        .writeLine(`const processBatch = async (): Promise<void> => {`)
        .writeLine(`  if (!isRunning) return;`)
        .blankLine()
        .writeLine(`  try {`)
        .writeLine(`    const batch = await this.$outbox.getNextBatch({ limit: batchSize });`)
        .blankLine()
        .writeLine(`    if (batch.length === 0) return;`)
        .blankLine()
        .writeLine(`    const toSync = batch.filter((event: OutboxEventRecord) => event.tries < maxRetries);`)
        .writeLine(`    const abandoned = batch.filter((event: OutboxEventRecord) => event.tries >= maxRetries);`)
        .blankLine()
        .writeLine(`    for (const event of abandoned) {`)
        .writeLine(`      await this.$outbox.markFailed(event.id, \`Abandoned after \${maxRetries} retries\`);`)
        .writeLine(`    }`)
        .blankLine()
        .writeLine(`    if (toSync.length === 0) return;`)
        .blankLine()
        .writeLine(`    let results: AppliedResult[] = [];`)
        .writeLine(`    try {`)
        .writeLine(`      results = await syncHandler(toSync);`)
        .writeLine(`    } catch (err) {`)
        .writeLine(`      for (const event of toSync) {`)
        .writeLine(`        const error = err instanceof Error ? err.message : String(err);`)
        .writeLine(`        await this.$outbox.markFailed(event.id, error);`)
        .writeLine(`      }`)
        .writeLine(`      return;`)
        .writeLine(`    }`)
        .blankLine()
        .writeLine(`    const successIds: string[] = [];`)
        .writeLine(`    for (const result of results) {`)
        .writeLine(`      if (result.error) {`)
        .writeLine(`        await this.$outbox.markFailed(result.id, result.error);`)
        .writeLine(`      } else {`)
        .writeLine(`        successIds.push(result.id);`)
        .blankLine()
        .writeLine(`        if (result.mergedRecord && result.entityKeyPath) {`)
        .writeLine(`          const originalEvent = toSync.find((e: OutboxEventRecord) => e.id === result.id);`)
        .writeLine(`          if (originalEvent) {`)
        .writeLine(`            const modelStore = (this as any)[this.toCamelCase(originalEvent.entityType)];`)
        .writeLine(`            if (modelStore && modelStore.upsert) {`)
        .writeLine(`              try {`)
        .writeLine(`                await modelStore.upsert({`)
        .writeLine(`                  where: { id: result.entityKeyPath },`)
        .writeLine(`                  update: result.mergedRecord,`)
        .writeLine(`                  create: {`)
        .writeLine(`                    id: result.entityKeyPath,`)
        .writeLine(`                    ...result.mergedRecord,`)
        .writeLine(`                  },`)
        .writeLine(`                });`)
        .writeLine(`              } catch (upsertErr) {`)
        .writeLine(`                console.warn(\`Failed to upsert merged record for event \${result.id}:\`, upsertErr);`)
        .writeLine(`              }`)
        .writeLine(`            }`)
        .writeLine(`          }`)
        .writeLine(`        }`)
        .writeLine(`      }`)
        .writeLine(`    }`)
        .blankLine()
        .writeLine(`    if (successIds.length > 0) {`)
        .writeLine(`      await this.$outbox.markSynced(successIds, { syncedAt: new Date() });`)
        .writeLine(`    }`)
        .writeLine(`  } catch (err) {`)
        .writeLine(`    console.error("Sync worker error:", err);`)
        .writeLine(`  }`)
        .writeLine(`};`)
        .blankLine()
        .writeLine(`const syncLoop = (): void => {`)
        .writeLine(`  processBatch().catch((err) => {`)
        .writeLine(`    console.error("Unhandled error in sync loop:", err);`)
        .writeLine(`  });`)
        .writeLine(`};`)
        .blankLine()
        .writeLine(`return {`)
        .writeLine(`  start(): void {`)
        .writeLine(`    if (isRunning) return;`)
        .writeLine(`    isRunning = true;`)
        .writeLine(`    syncLoop();`)
        .writeLine(`    intervalId = setInterval(syncLoop, intervalMs);`)
        .writeLine(`  },`)
        .blankLine()
        .writeLine(`  stop(): void {`)
        .writeLine(`    isRunning = false;`)
        .writeLine(`    if (intervalId !== null) {`)
        .writeLine(`      clearInterval(intervalId);`)
        .writeLine(`      intervalId = null;`)
        .writeLine(`    }`)
        .writeLine(`  },`)
        .writeLine(`};`);
    });
}

function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

function addObjectStoreInitialization(model: Model, writer: CodeBlockWriter) {
  const nonKeyUniqueIdentifiers = getUniqueIdentifiers(model).slice(1);
  const keyPath = getUniqueIdentifiers(model)[0].keyPath;

  let declarationLine = nonKeyUniqueIdentifiers.length ? `const ${model.name}Store = ` : ``;
  declarationLine += `db.createObjectStore('${model.name}', { keyPath: ${keyPath} });`;

  writer.writeLine(declarationLine);
  nonKeyUniqueIdentifiers.forEach(({ name, keyPath }) =>
    writer.writeLine(`${model.name}Store.createIndex("${name}Index", ${keyPath}, { unique: true });`),
  );
}

function addOutboxObjectStoreInitialization(writer: CodeBlockWriter, outboxModelName: string) {
  writer.writeLine(`db.createObjectStore('${outboxModelName}', { keyPath: ['id'] });`);
}

function addResetDatabaseMethod(writer: CodeBlockWriter) {
  writer.writeLine(`public async resetDatabase()`).block(() => {
    writer
      .writeLine(`this._db.close();`)
      .writeLine(`window.indexedDB.deleteDatabase("prisma-idb");`)
      .writeLine(`await PrismaIDBClient.instance.initialize();`);
  });
}
