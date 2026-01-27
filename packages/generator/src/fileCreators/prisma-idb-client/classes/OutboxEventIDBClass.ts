import CodeBlockWriter from "code-block-writer";

export function addOutboxEventIDBClass(writer: CodeBlockWriter, outboxModelName: string) {
  writer.writeLine(`class ${outboxModelName}IDBClass extends BaseIDBModelClass<"${outboxModelName}">`).block(() => {
    addConstructor(writer, outboxModelName);
    addCreateMethod(writer, outboxModelName);
    addGetNextBatchMethod(writer, outboxModelName);
    addMarkSyncedMethod(writer, outboxModelName);
    addMarkFailedMethod(writer, outboxModelName);
    addStatsMethod(writer, outboxModelName);
    addClearSyncedMethod(writer, outboxModelName);
  });
}

function addConstructor(writer: CodeBlockWriter, outboxModelName: string) {
  writer
    .writeLine(`constructor(client: PrismaIDBClient, keyPath: string[])`)
    .block(() => {
      writer.writeLine(`super(client, keyPath, "${outboxModelName}");`);
    })
    .blankLine();
}

function addCreateMethod(writer: CodeBlockWriter, outboxModelName: string) {
  writer
    .writeLine(
      `async create(query: { data: Pick<OutboxEventRecord, "entityType" | "operation" | "payload"> }): Promise<OutboxEventRecord>`,
    )
    .block(() => {
      writer
        .writeLine(`const tx = this.client._db.transaction("${outboxModelName}", "readwrite");`)
        .writeLine(`const store = tx.objectStore("${outboxModelName}");`)
        .blankLine()
        .writeLine(`const event: OutboxEventRecord = {`)
        .writeLine(`id: crypto.randomUUID(),`)
        .writeLine(`createdAt: new Date(),`)
        .writeLine(`synced: false,`)
        .writeLine(`syncedAt: null,`)
        .writeLine(`tries: 0,`)
        .writeLine(`lastError: null,`)
        .writeLine(`retryable: true,`)
        .writeLine(`...query.data,`)
        .writeLine(`};`)
        .blankLine()
        .writeLine(`await store.add(event);`)
        .writeLine(`await tx.done;`)
        .blankLine()
        .writeLine(`return event;`);
    })
    .blankLine();
}

function addGetNextBatchMethod(writer: CodeBlockWriter, outboxModelName: string) {
  writer
    .writeLine(`async getNextBatch(options?: { limit?: number }): Promise<OutboxEventRecord[]>`)
    .block(() => {
      writer
        .writeLine(`const limit = options?.limit ?? 20;`)
        .writeLine(`const tx = this.client._db.transaction("${outboxModelName}", "readonly");`)
        .writeLine(`const store = tx.objectStore("${outboxModelName}");`)
        .blankLine()
        .writeLine(`// Get all unsynced events, ordered by createdAt`)
        .writeLine(`const allEvents = await store.getAll();`)
        .writeLine(
          `const unsynced = allEvents.filter((e) => !e.synced && e.retryable).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());`,
        )
        .blankLine()
        .writeLine(`return unsynced.slice(0, limit);`);
    })
    .blankLine();
}

function addMarkSyncedMethod(writer: CodeBlockWriter, outboxModelName: string) {
  writer
    .writeLine(`async markSynced(appliedLogs: { id: string; lastAppliedChangeId: string | null }[]): Promise<void>`)
    .block(() => {
      writer
        .writeLine(`const syncedAt = new Date();`)
        .writeLine(`const tx = this.client._db.transaction(["${outboxModelName}", "VersionMeta"], "readwrite");`)
        .writeLine(`const store = tx.objectStore("${outboxModelName}");`)
        .blankLine()
        .writeLine(`for (const log of appliedLogs) {`)
        .writeLine(`const event = await store.get([log.id]);`)
        .writeLine(`if (event) {`)
        .writeLine(`await store.put({`)
        .writeLine(`...event,`)
        .writeLine(`synced: true,`)
        .writeLine(`syncedAt,`)
        .writeLine(`});`)
        .blankLine()
        .writeLine(`if (!(event.entityType in modelRecordToKeyPath)) {`)
        .writeLine(`throw new Error(\`Unknown model: \${event.entityType}\`);`)
        .writeLine(`}`)
        .blankLine()
        .writeLine(`try {`)
        .writeLine(
          `const parsedKey = modelRecordToKeyPath[event.entityType as keyof typeof modelRecordToKeyPath](event.payload);`,
        )
        .blankLine()
        .writeLine(`await this.client.$versionMeta.markPushed(event.entityType, parsedKey, { tx });`)
        .writeLine(`} catch (error) {`)
        .writeLine(`const errorMessage = error instanceof Error ? error.message : String(error);`)
        .writeLine(`console.error(\`Failed to parse keyPath for model \${event.entityType}: \${errorMessage}\`);`)
        .writeLine(`throw error;`)
        .writeLine(`}`)
        .writeLine(`}`)
        .writeLine(`}`)
        .blankLine()
        .writeLine(`await tx.done;`);
    })
    .blankLine();
}

function addMarkFailedMethod(writer: CodeBlockWriter, outboxModelName: string) {
  writer
    .writeLine(`async markFailed(eventId: string, error: NonNullable<PushResult['error']>): Promise<void>`)
    .block(() => {
      writer
        .writeLine(`const tx = this.client._db.transaction("${outboxModelName}", "readwrite");`)
        .writeLine(`const store = tx.objectStore("${outboxModelName}");`)
        .blankLine()
        .writeLine(`const event = await store.get([eventId]);`)
        .writeLine(`if (event) {`)
        .writeLine(`await store.put({`)
        .writeLine(`...event,`)
        .writeLine(`tries: (event.tries ?? 0) + 1,`)
        .writeLine(`lastError: \`\${error.message}: \${error.message}\`,`)
        .writeLine(`retryable: error.retryable,`)
        .writeLine(`});`)
        .writeLine(`}`)
        .blankLine()
        .writeLine(`await tx.done;`);
    })
    .blankLine();
}

function addStatsMethod(writer: CodeBlockWriter, outboxModelName: string) {
  writer
    .writeLine(`async stats(): Promise<{ unsynced: number; failed: number; lastError?: string }>`)
    .block(() => {
      writer
        .writeLine(`const tx = this.client._db.transaction("${outboxModelName}", "readonly");`)
        .writeLine(`const store = tx.objectStore("${outboxModelName}");`)
        .writeLine(`const allEvents = await store.getAll();`)
        .blankLine()
        .writeLine(`const unsynced = allEvents.filter((e) => !e.synced).length;`)
        .writeLine(`const failed = allEvents.filter((e) => e.lastError !== null && e.lastError !== undefined).length;`)
        .writeLine(
          `const lastError = allEvents.filter((e) => e.lastError).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]?.lastError;`,
        )
        .blankLine()
        .writeLine(`return { unsynced, failed, lastError: lastError ?? undefined };`);
    })
    .blankLine();
}

function addClearSyncedMethod(writer: CodeBlockWriter, outboxModelName: string) {
  writer
    .writeLine(`async clearSynced(options?: { olderThanDays?: number }): Promise<number>`)
    .block(() => {
      writer
        .writeLine(`const olderThanDays = options?.olderThanDays ?? 7;`)
        .writeLine(`const cutoffDate = new Date();`)
        .writeLine(`cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);`)
        .blankLine()
        .writeLine(`const tx = this.client._db.transaction("${outboxModelName}", "readwrite");`)
        .writeLine(`const store = tx.objectStore("${outboxModelName}");`)
        .writeLine(`const allEvents = await store.getAll();`)
        .blankLine()
        .writeLine(`let deletedCount = 0;`)
        .writeLine(`for (const event of allEvents) {`)
        .writeLine(`if (event.synced && new Date(event.createdAt) < cutoffDate) {`)
        .writeLine(`await store.delete([event.id]);`)
        .writeLine(`deletedCount++;`)
        .writeLine(`}`)
        .writeLine(`}`)
        .blankLine()
        .writeLine(`await tx.done;`)
        .writeLine(`return deletedCount;`);
    })
    .blankLine();
}
