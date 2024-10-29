import { CodeBlockWriter, Scope, SourceFile } from "ts-morph";
import { generateIDBKey, getModelFieldData, toCamelCase } from "./utils";
import { Model, FunctionalDefaultValue } from "./types";

export function addImports(file: SourceFile, models: readonly Model[]) {
  file.addImportDeclaration({ moduleSpecifier: "idb", namedImports: ["openDB"] });
  file.addImportDeclaration({ moduleSpecifier: "idb", namedImports: ["IDBPDatabase"], isTypeOnly: true });
  file.addImportDeclaration({ moduleSpecifier: "@prisma/client", namedImports: ["Prisma"], isTypeOnly: true });
  file.addImportDeclaration({ moduleSpecifier: "./utils", namedImports: ["filterByWhereClause"] });

  const defaultFieldValues = models.flatMap(({ fields }) =>
    fields
      .filter(({ default: defaultValue }) => typeof defaultValue === "object" && "name" in defaultValue)
      .map(({ default: defaultValue }) => defaultValue as FunctionalDefaultValue),
  );

  const needUUID = defaultFieldValues.some((defaultValue) => defaultValue.name === "uuid(4)");
  if (needUUID) {
    file.addImportDeclaration({ moduleSpecifier: "uuid", namedImports: [{ name: "v4", alias: "uuidv4" }] });
  }

  const needCUID = defaultFieldValues.some((defaultValue) => defaultValue.name === "cuid");
  if (needCUID) {
    file.addImportDeclaration({ moduleSpecifier: "@paralleldrive/cuid2", namedImports: [{ name: "createId" }] });
  }
}

function addObjectStoreInitialization(model: Model, writer: CodeBlockWriter) {
  const { nonKeyUniqueFields } = getModelFieldData(model);
  const keyPath = generateIDBKey(model);

  let declarationLine = nonKeyUniqueFields.length ? `const ${model.name}Store = ` : ``;
  declarationLine += `db.createObjectStore('${toCamelCase(model.name)}', { keyPath: ${keyPath} });`;

  writer.writeLine(declarationLine);
  nonKeyUniqueFields.forEach(({ name }) => {
    // TODO: perhaps an option to skip index creation on unique fields in the generator config?
    writer.writeLine(`${model.name}Store.createIndex("${name}Index", "${name}", { unique: true });`);
  });
}

export function addClientClass(file: SourceFile, models: readonly Model[]) {
  // Basic class structure
  const clientClass = file.addClass({
    name: "PrismaIDBClient",
    isExported: true,
    ctors: [{ scope: Scope.Private }],
    properties: [
      { name: "instance", isStatic: true, type: "PrismaIDBClient", scope: Scope.Private },
      { name: "db", type: "IDBPDatabase", hasExclamationToken: true },
    ],
  });

  // Add model properties
  models.forEach((model) =>
    clientClass.addProperty({ name: toCamelCase(model.name), type: `IDB${model.name}`, hasExclamationToken: true }),
  );

  // Add the create() method
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

  // Add the initialize() method
  clientClass.addMethod({
    name: "initialize",
    scope: Scope.Private,
    isAsync: true,
    statements: (writer) => {
      writer
        .writeLine("this.db = await openDB('prisma-idb', IDB_VERSION, {")
        .indent(() => {
          writer
            .writeLine("upgrade(db) {")
            .indent(() => {
              models.forEach((model) => addObjectStoreInitialization(model, writer));
            })
            .writeLine("}");
        })
        .writeLine("});");

      // Set members as object references of model classes
      models.forEach((model) => {
        writer.writeLine(`this.${toCamelCase(model.name)} = new IDB${model.name}(this, ${generateIDBKey(model)});`);
      });
    },
  });
}

export function addBaseModelClass(file: SourceFile) {
  file.addClass({
    name: "BaseIDBModelClass",
    properties: [
      { name: "client", type: "PrismaIDBClient" },
      { name: "keyPath", type: "string[]" },
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
    methods: [
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
      },
    ],
  });
}
