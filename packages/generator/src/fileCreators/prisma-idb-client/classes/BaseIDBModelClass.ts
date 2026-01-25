import CodeBlockWriter from "code-block-writer";

export function addBaseModelClass(
  writer: CodeBlockWriter,
  outboxSync: boolean = false,
  outboxModelName: string = "OutboxEvent",
) {
  writer.writeLine(`class BaseIDBModelClass<T extends keyof PrismaIDBSchema>`).block(() => {
    writer
      .writeLine(`protected client: PrismaIDBClient;`)
      .writeLine(`protected keyPath: string[];`)
      .writeLine(`protected modelName: string;`)
      .writeLine(`private eventEmitter: EventTarget;`)
      .blankLine();

    writer.writeLine(`constructor(client: PrismaIDBClient, keyPath: string[], modelName: string)`).block(() => {
      writer
        .writeLine(`this.client = client;`)
        .writeLine(`this.keyPath = keyPath;`)
        .writeLine(`this.modelName = modelName;`)
        .writeLine(`this.eventEmitter = new EventTarget();`);
    });

    addEventEmitters(writer, outboxSync, outboxModelName);
  });
}

function addEventEmitters(writer: CodeBlockWriter, outboxSync: boolean, outboxModelName: string = "OutboxEvent") {
  writer
    .writeLine(
      `subscribe(event: "create" | "update" | "delete" | ("create" | "update" | "delete")[], callback: (e: CustomEventInit<{ keyPath: PrismaIDBSchema[T]["key"]; oldKeyPath?: PrismaIDBSchema[T]["key"] }>) => void)`,
    )
    .block(() => {
      writer
        .writeLine(`if (Array.isArray(event))`)
        .block(() => {
          writer.writeLine(`event.forEach((event) => this.eventEmitter.addEventListener(event, callback));`);
        })
        .writeLine(`else`)
        .block(() => {
          writer.writeLine(`this.eventEmitter.addEventListener(event, callback);`);
        });
    });

  writer
    .writeLine(
      `unsubscribe(event: "create" | "update" | "delete" | ("create" | "update" | "delete")[], callback: (e: CustomEventInit<{ keyPath: PrismaIDBSchema[T]["key"]; oldKeyPath?: PrismaIDBSchema[T]["key"] }>) => void)`,
    )
    .block(() => {
      writer.writeLine(`if (Array.isArray(event))`).block(() => {
        writer.writeLine(`event.forEach((event) => this.eventEmitter.removeEventListener(event, callback));`);
        writer.writeLine(`return;`);
      });
      writer.writeLine(`this.eventEmitter.removeEventListener(event, callback);`);
    });

  writer
    .writeLine(
      `protected async emit(event: "create" | "update" | "delete", keyPath: PrismaIDBSchema[T]["key"], oldKeyPath?: PrismaIDBSchema[T]["key"], record?: unknown, opts?: { silent?: boolean; addToOutbox?: boolean; tx?: IDBUtils.ReadwriteTransactionType })`,
    )
    .block(() => {
      writer.writeLine(`const shouldEmit = !opts?.silent;`).blankLine();

      writer.writeLine(`if (shouldEmit)`).block(() => {
        writer
          .writeLine(`if (event === "update")`)
          .block(() => {
            writer.writeLine(
              `this.eventEmitter.dispatchEvent(new CustomEvent(event, { detail: { keyPath, oldKeyPath } }));`,
            );
          })
          .writeLine(`else`)
          .block(() => {
            writer.writeLine(`this.eventEmitter.dispatchEvent(new CustomEvent(event, { detail: { keyPath } }));`);
          });
      });

      if (!outboxSync) return;

      writer.blankLine();
      writer.writeLine(`if (opts?.addToOutbox !== false && this.client.shouldTrackModel(this.modelName))`).block(() => {
        writer
          .writeLine(`if (opts?.tx) {`)
          .writeLine(`const outboxStore = opts.tx.objectStore("${outboxModelName}");`)
          .writeLine(`const outboxEvent: OutboxEventRecord = {`)
          .writeLine(`id: crypto.randomUUID(),`)
          .writeLine(`createdAt: new Date(),`)
          .writeLine(`synced: false,`)
          .writeLine(`syncedAt: null,`)
          .writeLine(`tries: 0,`)
          .writeLine(`lastError: null,`)
          .writeLine(`entityType: this.modelName,`)
          .writeLine(`operation: event,`)
          .writeLine(`payload: record ?? keyPath,`)
          .writeLine(`retryable: true,`)
          .writeLine(`};`)
          .writeLine(`await outboxStore.add(outboxEvent);`)
          .writeLine(`}`);
      });
    });
}
