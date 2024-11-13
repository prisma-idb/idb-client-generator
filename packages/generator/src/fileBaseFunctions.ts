import { ClassDeclaration, CodeBlockWriter, Scope, SourceFile } from "ts-morph";
import { Model } from "./types";
import { generateIDBKey, getModelFieldData, toCamelCase } from "./helpers/utils";

export function addImports(file: SourceFile) {
  file.addImportDeclaration({ moduleSpecifier: "idb", namedImports: ["openDB"] });
  file.addImportDeclaration({ moduleSpecifier: "idb", namedImports: ["IDBPDatabase"], isTypeOnly: true });
  file.addImportDeclaration({ moduleSpecifier: "@prisma/client", namedImports: ["Prisma"], isTypeOnly: true });
  file.addImportDeclaration({
    moduleSpecifier: "./idb-interface",
    namedImports: ["PrismaIDBSchema"],
    isTypeOnly: true,
  });
}

function addObjectStoreInitialization(model: Model, writer: CodeBlockWriter) {
  const { nonKeyUniqueFields } = getModelFieldData(model);
  const keyPath = generateIDBKey(model);

  let declarationLine = nonKeyUniqueFields.length ? `const ${model.name}Store = ` : ``;
  declarationLine += `db.createObjectStore('${model.name}', { keyPath: ${keyPath} });`;

  writer.writeLine(declarationLine);
  nonKeyUniqueFields.forEach(({ name }) => {
    // TODO: perhaps an option to skip index creation on unique fields in the generator config?
    writer.writeLine(`${model.name}Store.createIndex("${name}Index", "${name}", { unique: true });`);
  });
}

export function addClientClass(file: SourceFile, models: readonly Model[]) {
  const clientClass = file.addClass({
    name: "PrismaIDBClient",
    isExported: true,
    ctors: [{ scope: Scope.Private }],
    properties: [
      { name: "instance", isStatic: true, type: "PrismaIDBClient", scope: Scope.Private },
      { name: "db", type: "IDBPDatabase<PrismaIDBSchema>", hasExclamationToken: true },
    ],
  });

  models.forEach((model) =>
    clientClass.addProperty({
      name: toCamelCase(model.name),
      type: `${model.name}IDBClass`,
      hasExclamationToken: true,
    }),
  );

  clientClass.addMethod({
    name: "create",
    isStatic: true,
    isAsync: true,
    scope: Scope.Public,
    returnType: "Promise<PrismaIDBClient>",
    statements: (writer) => {
      writer
        .writeLine("if (!PrismaIDBClient.instance) {")
        .indent(() => {
          writer
            .writeLine("const client = new PrismaIDBClient();")
            .writeLine("await client.initialize();")
            .writeLine("PrismaIDBClient.instance = client;");
        })
        .writeLine("}")
        .writeLine("return PrismaIDBClient.instance;");
    },
  });

  clientClass.addMethod({
    name: "initialize",
    scope: Scope.Private,
    isAsync: true,
    statements: (writer) => {
      writer
        .writeLine("this.db = await openDB<PrismaIDBSchema>('prisma-idb', IDB_VERSION, {")
        .indent(() => {
          writer
            .writeLine("upgrade(db) {")
            .indent(() => {
              models.forEach((model) => addObjectStoreInitialization(model, writer));
            })
            .writeLine("}");
        })
        .writeLine("});");

      models.forEach((model) => {
        writer.writeLine(
          `this.${toCamelCase(model.name)} = new ${model.name}IDBClass(this, ${generateIDBKey(model)});`,
        );
      });
    },
  });
}

export function addBaseModelClass(file: SourceFile) {
  const baseModelClass = file.addClass({
    name: "BaseIDBModelClass",
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
            .writeLine("this.client = client")
            .writeLine("this.keyPath = keyPath")
            .writeLine("this.eventEmitter = new EventTarget()");
        },
      },
    ],
  });

  addEventEmitters(baseModelClass);
}

export function addEventEmitters(baseModelClass: ClassDeclaration) {
  baseModelClass.addMethods([
    {
      name: "subscribe",
      parameters: [
        { name: "event", type: `"create" | "update" | "delete" | ("create" | "update" | "delete")[]` },
        { name: "callback", type: "() => void" },
      ],
      statements: (writer) => {
        writer
          .writeLine(`if (Array.isArray(event)) {`)
          .indent(() => {
            writer
              .writeLine(`event.forEach((event) => this.eventEmitter.addEventListener(event, callback));`)
              .writeLine(`return;`);
          })
          .writeLine("}")
          .writeLine(`this.eventEmitter.addEventListener(event, callback);`);
      },
    },
    {
      name: "unsubscribe",
      parameters: [
        { name: "event", type: `"create" | "update" | "delete" | ("create" | "update" | "delete")[]` },
        { name: "callback", type: "() => void" },
      ],
      statements: (writer) => {
        writer
          .writeLine(`if (Array.isArray(event)) {`)
          .indent(() =>
            writer
              .writeLine(`event.forEach((event) => this.eventEmitter.removeEventListener(event, callback));`)
              .writeLine(`return;`),
          )
          .writeLine("}")
          .writeLine(`this.eventEmitter.removeEventListener(event, callback);`);
      },
    },
    {
      name: "emit",
      parameters: [{ name: "event", type: `"create" | "update" | "delete"` }],
      statements: (writer) => writer.writeLine(`this.eventEmitter.dispatchEvent(new Event(event));`),
      scope: Scope.Protected,
    },
  ]);
}
