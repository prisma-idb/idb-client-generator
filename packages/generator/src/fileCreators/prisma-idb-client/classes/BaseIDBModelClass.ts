import CodeBlockWriter from "code-block-writer";

export function addBaseModelClass(writer: CodeBlockWriter, outboxSync: boolean = false) {
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

    addEventEmitters(writer, outboxSync);
  });
}

function addEventEmitters(writer: CodeBlockWriter, outboxSync: boolean) {
  writer
    .writeLine(
      `subscribe(event: "create" | "update" | "delete" | ("create" | "update" | "delete")[], callback: (e: CustomEvent<{ keyPath: PrismaIDBSchema[T]["key"]; oldKeyPath?: PrismaIDBSchema[T]["key"] }>) => void): () => void`
    )
    .block(() => {
      writer.write(`if (Array.isArray(event))`).block(() => {
        writer.writeLine(`event.forEach((evt) => this.eventEmitter.addEventListener(evt, callback as EventListener));`);
        writer.write(`return () =>`).block(() => {
          writer.writeLine(
            `event.forEach((evt) => this.eventEmitter.removeEventListener(evt, callback as EventListener));`
          );
        });
      });

      writer.writeLine(`this.eventEmitter.addEventListener(event, callback as EventListener);`);
      writer.write(`return () =>`).block(() => {
        writer.writeLine(`this.eventEmitter.removeEventListener(event, callback as EventListener);`);
      });
    });

  writer
    .writeLine(
      `protected async emit(event: "create" | "update" | "delete", keyPath: PrismaIDBSchema[T]["key"], oldKeyPath?: PrismaIDBSchema[T]["key"], record?: unknown, opts?: { silent?: boolean; addToOutbox?: boolean; tx?: IDBUtils.ReadwriteTransactionType })`
    )
    .block(() => {
      writer.writeLine(`const shouldEmit = !opts?.silent;`).blankLine();

      writer.writeLine(`if (shouldEmit)`).block(() => {
        writer
          .writeLine(`if (event === "update")`)
          .block(() => {
            writer.writeLine(
              `this.eventEmitter.dispatchEvent(new CustomEvent(event, { detail: { keyPath, oldKeyPath } }));`
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
          .writeLine(`await this.client.$outbox.create(`)
          .block(() => {
            writer
              .writeLine(`data: {`)
              .writeLine(`entityType: this.modelName,`)
              .writeLine(`operation: event,`)
              .writeLine(`payload: record ?? keyPath,`)
              .writeLine(`},`);
          })
          .writeLine(`, { tx: opts?.tx }`)
          .writeLine(`);`)
          .blankLine()
          .writeLine(`await this.client.$versionMeta.markLocalPending(this.modelName, keyPath, { tx: opts?.tx });`);
      });
    });
}
