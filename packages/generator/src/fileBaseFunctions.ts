import { ClassDeclaration, CodeBlockWriter, Scope, SourceFile } from "ts-morph";
import { addCountMethod } from "./Aggregate Functions/count";
import { addCreateMethod } from "./CRUD/create";
import { addCreateManyMethod } from "./CRUD/createMany";
import { addDeleteMethod } from "./CRUD/delete";
import { addDeleteManyMethod } from "./CRUD/deleteMany";
import { addFindFirstMethod } from "./CRUD/findFirst";
import { addFindManyMethod } from "./CRUD/findMany";
import { addFindUniqueMethod } from "./CRUD/findUnique";
import { addUpdateMethod } from "./CRUD/update";
import { addFillDefaultsFunction } from "./fillDefaultsFunction";
import { Model } from "./types";
import { generateIDBKey, getModelFieldData, toCamelCase } from "./utils";

export function addImports(file: SourceFile) {
  file.addImportDeclaration({ moduleSpecifier: "idb", namedImports: ["openDB"] });
  file.addImportDeclaration({ moduleSpecifier: "idb", namedImports: ["IDBPDatabase"], isTypeOnly: true });
  file.addImportDeclaration({ moduleSpecifier: "@prisma/client", namedImports: ["Prisma"], isTypeOnly: true });
  file.addImportDeclaration({
    moduleSpecifier: "./datamodel",
    namespaceImport: "models",
  });
  file.addImportDeclaration({
    moduleSpecifier: "./idb-interface",
    namedImports: ["PrismaIDBSchema"],
    isTypeOnly: true,
  });
  file.addImportDeclaration({
    moduleSpecifier: "./utils",
    namedImports: ["filterByWhereClause", "generateIDBKey", "getModelFieldData", "prismaToJsTypes"],
  });
  file.addImportDeclaration({
    moduleSpecifier: "./utils",
    namedImports: ["Model"],
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

export function addTypes(file: SourceFile, models: readonly Model[]) {
  file.addTypeAliases([
    {
      name: "ModelDelegate",
      isExported: true,
      type: (writer) => {
        models.forEach((model, idx) => {
          writer.write(`Prisma.${model.name}Delegate`);
          if (idx < models.length - 1) {
            writer.write(" | ");
          }
        });
      },
    },
    {
      name: "ObjectStoreName",
      type: (writer) => writer.writeLine("(typeof PrismaIDBClient.prototype.db.objectStoreNames)[number]"),
    },
  ]);
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

  // Add model properties
  models.forEach((model) =>
    clientClass.addProperty({
      name: toCamelCase(model.name),
      type: `BaseIDBModelClass<Prisma.${model.name}Delegate>`,
      hasExclamationToken: true,
    }),
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

      // Set members as object references of model classes
      models.forEach((model) => {
        writer.writeLine(
          `this.${toCamelCase(model.name)} = new BaseIDBModelClass<Prisma.${model.name}Delegate>(this, ${generateIDBKey(model)}, models.${model.name});`,
        );
      });
    },
  });
}

export function addBaseModelClass(file: SourceFile) {
  const baseModelClass = file.addClass({
    name: "BaseIDBModelClass",
    typeParameters: [{ name: "T", constraint: "ModelDelegate" }],
    properties: [
      { name: "client", type: "PrismaIDBClient", scope: Scope.Private },
      { name: "keyPath", type: "string[]", scope: Scope.Private },
      { name: "model", type: "Omit<Model, 'name'> & { name: ObjectStoreName }", scope: Scope.Private },
      { name: "eventEmitter", type: "EventTarget", scope: Scope.Private },
    ],
    ctors: [
      {
        parameters: [
          { name: "client", type: "PrismaIDBClient" },
          { name: "keyPath", type: "string[]" },
          { name: "model", type: "Model" },
        ],
        statements: (writer) => {
          writer
            .writeLine("this.client = client")
            .writeLine("this.keyPath = keyPath")
            .writeLine("this.model = model as Omit<Model, 'name'> & { name: ObjectStoreName }")
            .writeLine("this.eventEmitter = new EventTarget()");
        },
      },
    ],
  });

  addEventEmitters(baseModelClass);
  addFillDefaultsFunction(baseModelClass);

  // Find methods
  addFindManyMethod(baseModelClass);
  addFindFirstMethod(baseModelClass);
  addFindUniqueMethod(baseModelClass);

  // Create methods
  addCreateMethod(baseModelClass);
  addCreateManyMethod(baseModelClass);

  // Delete methods
  addDeleteMethod(baseModelClass);
  addDeleteManyMethod(baseModelClass);

  // Update methods
  addUpdateMethod(baseModelClass);

  // Aggregate function methods
  addCountMethod(baseModelClass);

  // Need a refactor
  // addAggregateMethod(baseModelClass);
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
      scope: Scope.Private,
    },
  ]);
}
