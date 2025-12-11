import { CodeBlockWriter } from "ts-morph";

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

function addEventEmitters(writer: CodeBlockWriter, outboxSync: boolean, outboxModelName: string) {
  writer
    .writeLine(
      `subscribe(event: "create" | "update" | "delete" | ("create" | "update" | "delete")[], callback: (e: CustomEventInit<{ keyPath: PrismaIDBSchema[T]["key"]; oldKeyPath?: PrismaIDBSchema[T]["key"] }>) => void)`,
    )
    .block(() => {
      writer.writeLine(`if (Array.isArray(event))`).block(() => {
        writer.writeLine(`event.forEach((event) => this.eventEmitter.addEventListener(event, callback));`);
        writer.writeLine(`return;`);
      });
      writer.writeLine(`this.eventEmitter.addEventListener(event, callback);`);
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
      `protected emit(event: "create" | "update" | "delete", keyPath: PrismaIDBSchema[T]["key"], oldKeyPath?: PrismaIDBSchema[T]["key"])`,
    )
    .block(() => {
      writer.writeLine(`if (event === "update")`).block(() => {
        writer.writeLine(
          `this.eventEmitter.dispatchEvent(new CustomEvent(event, { detail: { keyPath, oldKeyPath } }));`,
        );
        writer.writeLine(`return;`);
      });
      writer.writeLine(`this.eventEmitter.dispatchEvent(new CustomEvent(event, { detail: { keyPath } }));`);

      if (!outboxSync) return;

      writer.blankLine();
      writer.writeLine(`if (this.client.shouldTrackModel(this.modelName))`).block(() => {
        writer
          .writeLine(`const entityId = Array.isArray(keyPath) ? keyPath[0]?.toString() : keyPath?.toString();`)
          .writeLine(`this.client.$outbox.create({`)
          .writeLine(`data: {`)
          .writeLine(`entityType: this.modelName,`)
          .writeLine(`entityId: entityId ?? null,`)
          .writeLine(`operation: event,`)
          .writeLine(`payload: keyPath,`)
          .writeLine(`}`)
          .writeLine(`});`);
      });
    });
}
