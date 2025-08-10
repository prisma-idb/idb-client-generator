import { CodeBlockWriter } from "ts-morph";
import { getUniqueIdentifiers, toCamelCase } from "../../../helpers/utils";
import { Model } from "../../types";

export function addClientClass(writer: CodeBlockWriter, models: readonly Model[]) {
  writer.writeLine(`export class PrismaIDBClient`).block(() => {
    writer
      .writeLine(`private static instance: PrismaIDBClient;`)
      .writeLine(`_db!: IDBPDatabase<PrismaIDBSchema>;`)
      .blankLine()
      .writeLine(`private constructor() {}`);

    addModelProperties(writer, models);
    addCreateInstanceMethod(writer);
    addResetDatabaseMethod(writer);
    addInitializeMethod(writer, models);
  });
}

function addModelProperties(writer: CodeBlockWriter, models: readonly Model[]) {
  models.forEach((model) => writer.writeLine(`${toCamelCase(model.name)}!: ${model.name}IDBClass;`));
}

function addCreateInstanceMethod(writer: CodeBlockWriter) {
  writer.writeLine(`public static async createClient(): Promise<PrismaIDBClient>`).block(() => {
    writer
      .writeLine(`if (!PrismaIDBClient.instance)`)
      .block(() => {
        writer
          .writeLine(`const client = new PrismaIDBClient();`)
          .writeLine(`await client.initialize();`)
          .writeLine(`PrismaIDBClient.instance = client;`);
      })
      .writeLine(`return PrismaIDBClient.instance;`);
  });
}

function addInitializeMethod(writer: CodeBlockWriter, models: readonly Model[]) {
  writer.writeLine(`private async initialize()`).block(() => {
    writer
      .writeLine(`this._db = await openDB<PrismaIDBSchema>("prisma-idb", IDB_VERSION, `)
      .block(() => {
        writer.writeLine(`upgrade(db) `).block(() => {
          models.forEach((model) => addObjectStoreInitialization(model, writer));
        });
      })
      .writeLine(`);`);

    models.forEach((model) => {
      writer.writeLine(
        `this.${toCamelCase(model.name)} = new ${model.name}IDBClass(this, ${getUniqueIdentifiers(model)[0].keyPath});`,
      );
    });
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

function addResetDatabaseMethod(writer: CodeBlockWriter) {
  writer.writeLine(`public async resetDatabase()`).block(() => {
    writer
      .writeLine(`this._db.close();`)
      .writeLine(`window.indexedDB.deleteDatabase("prisma-idb");`)
      .writeLine(`await PrismaIDBClient.instance.initialize();`);
  });
}
