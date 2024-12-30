import { SourceFile, Scope, ClassDeclaration } from "ts-morph";

export function addBaseModelClass(file: SourceFile) {
  const baseModelClass = file.addClass({
    name: "BaseIDBModelClass<T extends keyof PrismaIDBSchema>",
    properties: [
      { name: "client", type: "PrismaIDBClient", scope: Scope.Protected },
      { name: "keyPath", type: "string[]", scope: Scope.Protected },
      { name: "eventEmitter", type: "EventTarget", scope: Scope.Private },
    ],
    ctors: [
      {
        parameters: [
          { name: "client", type: "PrismaIDBClient" },
          { name: "keyPath", type: "string[]" },
        ],
        statements: (writer) => {
          writer
            .writeLine("this.client = client;")
            .writeLine("this.keyPath = keyPath;")
            .writeLine("this.eventEmitter = new EventTarget();");
        },
      },
    ],
  });

  addEventEmitters(baseModelClass);
}

function addEventEmitters(baseModelClass: ClassDeclaration) {
  baseModelClass.addMethods([
    {
      name: "subscribe",
      parameters: [
        { name: "event", type: `"create" | "update" | "delete" | ("create" | "update" | "delete")[]` },
        {
          name: "callback",
          type: `(e: CustomEventInit<{ keyPath: PrismaIDBSchema[T]["key"]; oldKeyPath?: PrismaIDBSchema[T]["key"] }>) => void`,
        },
      ],
      statements: (writer) => {
        writer
          .writeLine(`if (Array.isArray(event))`)
          .block(() => {
            writer
              .writeLine(`event.forEach((event) => this.eventEmitter.addEventListener(event, callback));`)
              .writeLine(`return;`);
          })
          .writeLine(`this.eventEmitter.addEventListener(event, callback);`);
      },
    },
    {
      name: "unsubscribe",
      parameters: [
        { name: "event", type: `"create" | "update" | "delete" | ("create" | "update" | "delete")[]` },
        {
          name: "callback",
          type: `(e: CustomEventInit<{ keyPath: PrismaIDBSchema[T]["key"]; oldKeyPath?: PrismaIDBSchema[T]["key"] }>) => void`,
        },
      ],
      statements: (writer) => {
        writer
          .writeLine(`if (Array.isArray(event))`)
          .block(() =>
            writer
              .writeLine(`event.forEach((event) => this.eventEmitter.removeEventListener(event, callback));`)
              .writeLine(`return;`),
          )
          .writeLine(`this.eventEmitter.removeEventListener(event, callback);`);
      },
    },
    {
      name: "emit",
      parameters: [
        { name: "event", type: `"create" | "update" | "delete"` },
        { name: "keyPath", type: `PrismaIDBSchema[T]["key"]` },
        { name: "oldKeyPath?", type: `PrismaIDBSchema[T]["key"]` },
      ],
      statements: (writer) => {
        writer
          .writeLine(`if (event === "update")`)
          .block(() => {
            writer
              .writeLine(
                `this.eventEmitter.dispatchEvent(new CustomEvent(event, { detail: { keyPath, oldKeyPath } }));`,
              )
              .writeLine(`return;`);
          })
          .writeLine(`this.eventEmitter.dispatchEvent(new CustomEvent(event, { detail: { keyPath } }));`);
      },
      scope: Scope.Protected,
    },
  ]);
}
