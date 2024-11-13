import { CodeBlockWriter, Scope, SourceFile } from "ts-morph";
import { generateIDBKey, getModelFieldData, toCamelCase } from "../../../helpers/utils";
import { Model } from "../../types";

function addObjectStoreInitialization(model: Model, writer: CodeBlockWriter) {
  const { nonKeyUniqueFields } = getModelFieldData(model);
  const keyPath = generateIDBKey(model);

  let declarationLine = nonKeyUniqueFields.length ? `const ${model.name}Store = ` : ``;
  declarationLine += `db.createObjectStore('${model.name}', { keyPath: ${keyPath} });`;

  writer.writeLine(declarationLine);
  nonKeyUniqueFields.forEach(({ name }) =>
    writer.writeLine(`${model.name}Store.createIndex("${name}Index", "${name}", { unique: true });`),
  );
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

  clientClass.addMethod({
    name: "initialize",
    scope: Scope.Private,
    isAsync: true,
    statements: (writer) => {
      writer
        .writeLine("this.db = await openDB<PrismaIDBSchema>('prisma-idb', IDB_VERSION, ")
        .block(() => {
          writer.writeLine("upgrade(db) {").block(() => {
            models.forEach((model) => addObjectStoreInitialization(model, writer));
          });
        })
        .writeLine(");");

      models.forEach((model) => {
        writer.writeLine(
          `this.${toCamelCase(model.name)} = new ${model.name}IDBClass(this, ${generateIDBKey(model)});`,
        );
      });
    },
  });
}
