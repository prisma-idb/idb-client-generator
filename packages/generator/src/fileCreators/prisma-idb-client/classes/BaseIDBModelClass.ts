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

/**
 * Adds `subscribe`, `unsubscribe`, and a protected `emit` method to the class using the provided CodeBlockWriter.
 *
 * The generated `subscribe` and `unsubscribe` methods accept either a single event (`"create" | "update" | "delete"`) or an array of those events and register/unregister the provided callback accordingly. The callback receives a `CustomEventInit` whose `detail` contains `keyPath` and, for `"update"`, may also include `oldKeyPath`.
 *
 * The generated protected `emit` method has the signature `(event, keyPath, oldKeyPath?, record?, silent?, addToOutbox?)`. It dispatches a `CustomEvent` for the given `event` unless `silent` is true; `"update"` events include both `keyPath` and `oldKeyPath` in the event `detail`, other events include only `keyPath`. When `outboxSync` is enabled and `addToOutbox` is not strictly `false`, and the client indicates the model should be tracked, `emit` creates an outbox entry with `entityType` set to the model name, `entityKeyPath` set to `keyPath`, `operation` set to the event name, and `payload` set to `record` if provided or `keyPath` otherwise.
 *
 * @param writer - CodeBlockWriter used to emit the TypeScript method implementations into the class.
 * @param outboxSync - If `true`, the generated `emit` method includes logic to add an entry to the client's outbox when appropriate.
 */
function addEventEmitters(writer: CodeBlockWriter, outboxSync: boolean) {
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
      `protected async emit(event: "create" | "update" | "delete", keyPath: PrismaIDBSchema[T]["key"], oldKeyPath?: PrismaIDBSchema[T]["key"], record?: unknown, silent?: boolean, addToOutbox?: boolean)`,
    )
    .block(() => {
      writer.writeLine(`const shouldEmit = !silent;`).blankLine();

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
      writer.writeLine(`if (addToOutbox !== false && this.client.shouldTrackModel(this.modelName))`).block(() => {
        writer
          .writeLine(`await this.client.$outbox.create({`)
          .writeLine(`data: {`)
          .writeLine(`entityType: this.modelName,`)
          .writeLine(`entityKeyPath: keyPath as Array<string | number>,`)
          .writeLine(`operation: event,`)
          .writeLine(`payload: record ?? keyPath,`)
          .writeLine(`}`)
          .writeLine(`});`);
      });
    });
}