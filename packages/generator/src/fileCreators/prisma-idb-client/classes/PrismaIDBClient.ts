import CodeBlockWriter from "code-block-writer";
import { getUniqueIdentifiers, toCamelCase as toCamelCaseUtil } from "../../../helpers/utils";
import { shouldTrackModel } from "../../outbox/utils";
import { Model } from "../../types";

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
    if (outboxSync) {
      addCreateSyncWorkerMethod(writer, models);
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
      writer.writeLine(`this.$outbox = new ${outboxModelName}IDBClass(this, ['id']);`);
    }
  });
}

function addShouldTrackModelMethod(writer: CodeBlockWriter) {
  writer.writeLine(`shouldTrackModel(modelName: string): boolean`).block(() => {
    writer.writeLine(`return this.outboxEnabled && this.includedModels.has(modelName);`);
  });
}

function generateModelUpsertCase(writer: CodeBlockWriter, model: Model) {
  const pk = getUniqueIdentifiers(model)[0];
  const pkFields = JSON.parse(pk.keyPath) as string[];
  const modelProperty = toCamelCaseUtil(model.name);

  writer.writeLine(`                case "${model.name}": {`);
  writer.block(() => {
    writer.writeLine(
      `                  const recordValidation = validators.${model.name}.safeParse(result.mergedRecord);`,
    );
    writer.writeLine(`                  if (!recordValidation.success) {`);
    writer.writeLine(
      `                    throw new Error(\`Record validation failed: \${recordValidation.error.message}\`);`,
    );
    writer.writeLine(`                  }`);
    writer.writeLine(
      `                  const keyPathValidation = keyPathValidators.${model.name}.safeParse(result.entityKeyPath);`,
    );
    writer.writeLine(`                  if (!keyPathValidation.success) {`);
    writer.writeLine(
      `                    throw new Error(\`KeyPath validation failed: \${keyPathValidation.error.message}\`);`,
    );
    writer.writeLine(`                  }`);

    let whereClause: string;
    if (pkFields.length === 1) {
      whereClause = `{ ${pkFields[0]}: keyPathValidation.data[0] }`;
    } else {
      const compositeKey = pkFields.map((field, i) => `${field}: keyPathValidation.data[${i}]`).join(", ");
      whereClause = `{ ${pk.name}: { ${compositeKey} } }`;
    }

    writer.writeLine(`                  await this.${modelProperty}.upsert({`);
    writer.writeLine(`                    where: ${whereClause},`);
    writer.writeLine(`                    update: recordValidation.data,`);
    writer.writeLine(`                    create: recordValidation.data,`);
    writer.writeLine(`                  }, { silent: true, addToOutbox: false });`);
    writer.writeLine(`                  break;`);
  });
  writer.writeLine(`                }`);
}

function addCreateSyncWorkerMethod(writer: CodeBlockWriter, models: readonly Model[]) {
  writer
    .writeLine(`/**`)
    .writeLine(` * Create a sync worker for bi-directional synchronization with remote server.`)
    .writeLine(` *`)
    .writeLine(` * The worker implements a structured sync pattern:`)
    .writeLine(` * 1. **Push phase**: Drains all local events (outbox) to server until empty or abandoned`)
    .writeLine(` * 2. **Pull phase**: Fetches remote changes incrementally using cursor-based pagination`)
    .writeLine(` * 3. **Schedule**: Repeats cycles at fixed intervals with proper error handling`)
    .writeLine(` *`)
    .writeLine(` * @param options Sync configuration`)
    .writeLine(` * @param options.push Push handler configuration`)
    .writeLine(` * @param options.push.handler Function that receives batch of outbox events and returns sync results.`)
    .writeLine(` *   Should return AppliedResult[] with status for each event. Thrown errors are caught internally`)
    .writeLine(` *   and events are marked as failed with error message.`)
    .writeLine(` * @param options.push.batchSize Maximum events to process in one push batch (default: 10)`)
    .writeLine(` * @param options.pull Pull handler configuration`)
    .writeLine(` * @param options.pull.handler Function that fetches remote changes since cursor.`)
    .writeLine(` *   Must return { logsWithRecords, cursor } where cursor enables resumable pagination.`)
    .writeLine(` *   Thrown errors stop pull phase gracefully; will retry next cycle.`)
    .writeLine(` * @param options.pull.getCursor Optional handler to retrieve persisted pull cursor.`)
    .writeLine(` *   If not provided, starts from undefined (first page). Use this to resume from checkpoint.`)
    .writeLine(
      ` * @param options.pull.setCursor Optional handler to persist pull cursor after successful page processing.`,
    )
    .writeLine(` *   Called only after logsWithRecords are successfully applied to local state.`)
    .writeLine(` * @param options.schedule Scheduling configuration`)
    .writeLine(` * @param options.schedule.intervalMs Milliseconds between sync cycles (default: 5000)`)
    .writeLine(
      ` * @param options.schedule.maxRetries Max retry attempts for outbox events before abandoning (default: 5)`,
    )
    .writeLine(` *`)
    .writeLine(` * @returns SyncWorker with start() and stop() methods`)
    .writeLine(` *`)
    .writeLine(` * @example`)
    .writeLine(` * const worker = client.createSyncWorker({`)
    .writeLine(` *   push: {`)
    .writeLine(` *     handler: async (events) => {`)
    .writeLine(` *       return await api.syncBatch(events);  // send to server`)
    .writeLine(` *     },`)
    .writeLine(` *     batchSize: 20`)
    .writeLine(` *   },`)
    .writeLine(` *   pull: {`)
    .writeLine(` *     handler: async (cursor) => {`)
    .writeLine(` *       return await api.pullChanges({ since: cursor });`)
    .writeLine(` *     },`)
    .writeLine(` *     getCursor: async () => {`)
    .writeLine(` *       const value = localStorage.getItem('syncCursor');`)
    .writeLine(` *       const cursor = value ? parseInt(value, 10) : NaN;`)
    .writeLine(` *       return isNaN(cursor) ? undefined : cursor;`)
    .writeLine(` *     },`)
    .writeLine(` *     setCursor: async (cursor) => {`)
    .writeLine(` *       if (cursor !== undefined) {`)
    .writeLine(` *         localStorage.setItem('syncCursor', String(cursor));`)
    .writeLine(` *       } else {`)
    .writeLine(` *         localStorage.removeItem('syncCursor');`)
    .writeLine(` *       }`)
    .writeLine(` *     }`)
    .writeLine(` *   },`)
    .writeLine(` *   schedule: { intervalMs: 3000, maxRetries: 10 }`)
    .writeLine(` * });`)
    .writeLine(` *`)
    .writeLine(` * worker.start();   // begins sync cycles`)
    .writeLine(` * worker.stop();    // gracefully stops`)
    .writeLine(` */`)
    .writeLine(
      `createSyncWorker(options: { push: { handler: (events: OutboxEventRecord[]) => Promise<AppliedResult[]>; batchSize?: number }; pull: { handler: (cursor?: number) => Promise<{ cursor?: number; logsWithRecords: LogWithRecord<typeof validators>[] }>; getCursor?: () => Promise<number | undefined>; setCursor?: (cursor: number | undefined) => Promise<void> }; schedule?: { intervalMs?: number; maxRetries?: number } }): SyncWorker`,
    )
    .block(() => {
      writer
        .writeLine(`const { push, pull } = options;`)
        .writeLine(`const { handler: pushHandler, batchSize = 10 } = push;`)
        .writeLine(`const { handler: pullHandler, getCursor, setCursor } = pull;`)
        .writeLine(`const { intervalMs = 5000, maxRetries = 5 } = options.schedule || {};`)
        .blankLine()
        .writeLine(`let intervalId: ReturnType<typeof setInterval | typeof setTimeout> | null = null;`)
        .writeLine(`let isRunning = false;`)
        .writeLine(`let isProcessing = false;`)
        .blankLine()
        .writeLine(`/**`)
        .writeLine(` * Process a batch of outbox events passed as argument.`)
        .writeLine(` * This is the core unit of push work, avoiding redundant fetches.`)
        .writeLine(` */`)
        .writeLine(`const pushBatch = async (batch: OutboxEventRecord[]): Promise<void> => {`)
        .writeLine(`  if (batch.length === 0) return;`)
        .blankLine()
        .writeLine(`  const toSync = batch.filter((event: OutboxEventRecord) => event.tries < maxRetries);`)
        .writeLine(`  const abandoned = batch.filter((event: OutboxEventRecord) => event.tries >= maxRetries);`)
        .blankLine()
        .writeLine(`  for (const event of abandoned) {`)
        .writeLine(`    await this.$outbox.markFailed(event.id, \`Abandoned after \${maxRetries} retries\`);`)
        .writeLine(`  }`)
        .blankLine()
        .writeLine(`  if (toSync.length === 0) return;`)
        .blankLine()
        .writeLine(`  let results: AppliedResult[] = [];`)
        .writeLine(`  try {`)
        .writeLine(`    results = await pushHandler(toSync);`)
        .writeLine(`  } catch (err) {`)
        .writeLine(`    for (const event of toSync) {`)
        .writeLine(`      const error = err instanceof Error ? err.message : String(err);`)
        .writeLine(`      await this.$outbox.markFailed(event.id, error);`)
        .writeLine(`    }`)
        .writeLine(`    return;`)
        .writeLine(`  }`)
        .blankLine()
        .writeLine(`  const successIds: string[] = [];`)
        .writeLine(`  for (const result of results) {`)
        .writeLine(`    if (result.error) {`)
        .writeLine(`      await this.$outbox.markFailed(result.id, result.error);`)
        .writeLine(`    } else {`)
        .writeLine(`      successIds.push(result.id);`)
        .blankLine()
        .writeLine(`      if (result.mergedRecord && result.entityKeyPath) {`)
        .writeLine(`        const originalEvent = toSync.find((e: OutboxEventRecord) => e.id === result.id);`)
        .writeLine(`        if (originalEvent) {`)
        .writeLine(`          try {`)
        .writeLine(`            switch (originalEvent.entityType) {`);

      // Generate model-specific cases with upsert logic
      models.forEach((model) => {
        generateModelUpsertCase(writer, model);
      });

      writer
        .writeLine(`              default:`)
        .writeLine(`                throw new Error(\`No upsert handler for \${originalEvent.entityType}\`);`)
        .writeLine(`            }`)
        .writeLine(`          } catch (upsertErr) {`)
        .writeLine(`            console.warn(\`Failed to upsert merged record for event \${result.id}:\`, upsertErr);`)
        .writeLine(`          }`)
        .writeLine(`        }`)
        .writeLine(`      }`)
        .writeLine(`    }`)
        .writeLine(`  }`)
        .blankLine()
        .writeLine(`  if (successIds.length > 0) {`)
        .writeLine(`    await this.$outbox.markSynced(successIds, { syncedAt: new Date() });`)
        .writeLine(`  }`)
        .writeLine(`};`)
        .blankLine()
        .writeLine(`/**`)
        .writeLine(` * Drain the push phase: keep pushing batches until outbox is empty`)
        .writeLine(` * or all remaining events are abandoned (unrecoverable).`)
        .writeLine(` *`)
        .writeLine(` * Invariant: when this completes, there are no syncable events left.`)
        .writeLine(` */`)
        .writeLine(`const drainPushPhase = async (): Promise<void> => {`)
        .writeLine(`  while (isRunning) {`)
        .writeLine(`    const batch = await this.$outbox.getNextBatch({ limit: batchSize });`)
        .blankLine()
        .writeLine(`    if (batch.length === 0) break;`)
        .blankLine()
        .writeLine(`    const hasSyncable = batch.some((e: OutboxEventRecord) => e.tries < maxRetries);`)
        .writeLine(`    await pushBatch(batch);`)
        .blankLine()
        .writeLine(`    if (!hasSyncable) break;`)
        .writeLine(`  }`)
        .writeLine(`};`)
        .blankLine()
        .writeLine(`/**`)
        .writeLine(` * Drain the pull phase: keep pulling pages until no more data is available.`)
        .writeLine(` *`)
        .writeLine(` * Rules:`)
        .writeLine(` * - Only executes after push phase completes`)
        .writeLine(` * - Never writes to outbox`)
        .writeLine(` * - Uses optional cursor state handlers provided by user`)
        .writeLine(` * - Handles errors gracefully, stops pull on failure`)
        .writeLine(` */`)
        .writeLine(`const drainPullPhase = async (): Promise<void> => {`)
        .writeLine(`  let cursor = getCursor ? await getCursor() : undefined;`)
        .blankLine()
        .writeLine(`  while (isRunning) {`)
        .writeLine(`    try {`)
        .writeLine(`      const res = await pullHandler(cursor);`)
        .writeLine(`      const { logsWithRecords, cursor: nextCursor } = res;`)
        .blankLine()
        .writeLine(`      if (logsWithRecords.length === 0) break;`)
        .blankLine()
        .writeLine(`      await applyPull(this, logsWithRecords);`)
        .blankLine()
        .writeLine(`      if (setCursor) {`)
        .writeLine(`        await setCursor(nextCursor);`)
        .writeLine(`      }`)
        .blankLine()
        .writeLine(`      cursor = nextCursor;`)
        .writeLine(`      if (typeof cursor !== 'number') break;`)
        .writeLine(`    } catch (err) {`)
        .writeLine(`      const errorMessage = err instanceof Error ? err.message : String(err);`)
        .writeLine(`      console.error('Pull failed:', errorMessage);`)
        .writeLine(`      break;`)
        .writeLine(`    }`)
        .writeLine(`  }`)
        .writeLine(`};`)
        .blankLine()
        .writeLine(`/**`)
        .writeLine(` * Execute one complete sync cycle:`)
        .writeLine(` * 1. Drain push phase (all local events → server)`)
        .writeLine(` * 2. Drain pull phase (server state → local)`)
        .writeLine(` *`)
        .writeLine(` * Guarantees:`)
        .writeLine(` * - No overlapping sync cycles (guarded by isProcessing)`)
        .writeLine(` * - Push fully completes before pull starts`)
        .writeLine(` * - Order is unbreakable`)
        .writeLine(` */`)
        .writeLine(`const syncOnce = async (): Promise<void> => {`)
        .writeLine(`  if (!isRunning || isProcessing) return;`)
        .blankLine()
        .writeLine(`  isProcessing = true;`)
        .writeLine(`  try {`)
        .writeLine(`    await drainPushPhase();`)
        .writeLine(`    await drainPullPhase();`)
        .writeLine(`  } catch (err) {`)
        .writeLine(`    console.error('Sync cycle failed:', err);`)
        .writeLine(`  } finally {`)
        .writeLine(`    isProcessing = false;`)
        .writeLine(`  }`)
        .writeLine(`};`)
        .blankLine()
        .writeLine(`/**`)
        .writeLine(` * Schedule the next sync cycle after the current one completes.`)
        .writeLine(` * This prevents overlapping sync work and maintains proper spacing.`)
        .writeLine(` */`)
        .writeLine(`const scheduleNext = (): void => {`)
        .writeLine(`  if (!isRunning) return;`)
        .writeLine(`  intervalId = setTimeout(async () => {`)
        .writeLine(`    await syncOnce();`)
        .writeLine(`    scheduleNext();`)
        .writeLine(`  }, intervalMs);`)
        .writeLine(`};`)
        .blankLine()
        .writeLine(`return {`)
        .writeLine(`  start(): void {`)
        .writeLine(`    if (isRunning) return;`)
        .writeLine(`    isRunning = true;`)
        .writeLine(`    syncOnce()`)
        .writeLine(`      .catch((err) => {`)
        .writeLine(`        console.error('Unhandled error starting sync:', err);`)
        .writeLine(`      })`)
        .writeLine(`      .finally(scheduleNext);`)
        .writeLine(`  },`)
        .blankLine()
        .writeLine(`  stop(): void {`)
        .writeLine(`    isRunning = false;`)
        .writeLine(`    if (intervalId !== null) {`)
        .writeLine(`      clearTimeout(intervalId);`)
        .writeLine(`      intervalId = null;`)
        .writeLine(`    }`)
        .writeLine(`  },`)
        .writeLine(`};`);
    });
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
