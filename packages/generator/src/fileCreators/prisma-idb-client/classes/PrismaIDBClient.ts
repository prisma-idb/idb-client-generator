import { ClassDeclaration, CodeBlockWriter, Scope, SourceFile } from "ts-morph";
import { getUniqueIdentifiers, toCamelCase } from "../../../helpers/utils";
import { Model } from "../../types";

export function addClientClass(file: SourceFile, models: readonly Model[]) {
  const clientClass = file.addClass({
    name: "PrismaIDBClient",
    isExported: true,
    ctors: [{ scope: Scope.Private }],
    properties: [
      { name: "instance", isStatic: true, type: "PrismaIDBClient", scope: Scope.Private },
      { name: "_db", type: "IDBPDatabase<PrismaIDBSchema>", hasExclamationToken: true },
    ],
  });

  addModelProperties(clientClass, models);
  addCreateInstanceMethod(clientClass);
  addInitializeMethod(clientClass, models);
}

function addModelProperties(clientClass: ClassDeclaration, models: readonly Model[]) {
  models.forEach((model) =>
    clientClass.addProperty({
      name: toCamelCase(model.name),
      type: `${model.name}IDBClass`,
      hasExclamationToken: true,
    }),
  );
}

function addCreateInstanceMethod(clientClass: ClassDeclaration) {
  clientClass.addMethod({
    name: "createClient",
    isStatic: true,
    isAsync: true,
    scope: Scope.Public,
    returnType: "Promise<PrismaIDBClient>",
    statements: (writer) => {
      writer
        .writeLine("if (!PrismaIDBClient.instance)")
        .block(() => {
          writer
            .writeLine("const client = new PrismaIDBClient();")
            .writeLine("await client.initialize();")
            .writeLine("PrismaIDBClient.instance = client;");
        })
        .writeLine("return PrismaIDBClient.instance;");
    },
  });
}

function addInitializeMethod(clientClass: ClassDeclaration, models: readonly Model[]) {
  clientClass.addMethod({
    name: "initialize",
    scope: Scope.Private,
    isAsync: true,
    statements: (writer) => {
      writer
        .writeLine("this._db = await openDB<PrismaIDBSchema>('prisma-idb', IDB_VERSION, ")
        .block(() => {
          writer.writeLine("upgrade(db)").block(() => {
            models.forEach((model) => addObjectStoreInitialization(model, writer));
          });
        })
        .writeLine(");");

      models.forEach((model) => {
        writer.writeLine(
          `this.${toCamelCase(model.name)} = new ${model.name}IDBClass(this, ${getUniqueIdentifiers(model)[0].keyPath});`,
        );
      });
    },
  });
}

function addObjectStoreInitialization(model: Model, writer: CodeBlockWriter) {
  const nonKeyUniqueIdentifiers = getUniqueIdentifiers(model).slice(1);
  const keyPath = getUniqueIdentifiers(model)[0].keyPath;

  let declarationLine = nonKeyUniqueIdentifiers.length ? `const ${model.name}Store = ` : ``;
  declarationLine += `db.createObjectStore('${model.name}', { keyPath: ${keyPath} });`;

  writer.writeLine(declarationLine);
  nonKeyUniqueIdentifiers.forEach(({ name, keyPath }) =>
    writer.writeLine(`${model.name}Store.createIndex("${name}Index", ${keyPath}, { unique: true });`),
  );
}
