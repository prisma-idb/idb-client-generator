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
      `protected async emit(event: "create" | "update" | "delete", keyPath: PrismaIDBSchema[T]["key"], oldKeyPath?: PrismaIDBSchema[T]["key"], record?: unknown, silent?: boolean)`,
    )
    .block(() => {
      writer.writeLine(`if (silent) return;`).blankLine();

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

      if (!outboxSync) return;

      writer.blankLine();
      writer.writeLine(`if (this.client.shouldTrackModel(this.modelName))`).block(() => {
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
