import { CodeBlockWriter } from "ts-morph";
import { getUniqueIdentifiers, toCamelCase } from "../../../helpers/utils";
import { Model } from "../../types";
import { shouldTrackModel } from "../../outbox/utils";

export function addClientClass(
  writer: CodeBlockWriter,
  models: readonly Model[],
  outboxSync: boolean = false,
  outboxModelName: string = "OutboxEvent",
  include: string[] = ["*"],
  exclude: string[] = [],
) {
  writer.writeLine(`export class PrismaIDBClient`).block(() => {
    writer
      .writeLine(`private static instance: PrismaIDBClient;`)
      .writeLine(`_db!: IDBPDatabase<PrismaIDBSchema>;`)
      .writeLine(`private outboxEnabled: boolean = ${outboxSync};`)
      .writeLine(`private includedModels: Set<string>;`)
      .blankLine()
      .writeLine(`private constructor() {`)
      .writeLine(
        `this.includedModels = new Set(${JSON.stringify(models.filter((m) => shouldTrackModel(m.name, include, exclude)).map((m) => m.name))});`,
      )
      .writeLine(`}`);

    addModelProperties(writer, models);
    addOutboxProperty(writer, outboxSync, outboxModelName);
    addCreateInstanceMethod(writer);
    addResetDatabaseMethod(writer);
    addShouldTrackModelMethod(writer);
    addInitializeMethod(writer, models, outboxSync, outboxModelName);
  });
}

function addModelProperties(writer: CodeBlockWriter, models: readonly Model[]) {
  models.forEach((model) => writer.writeLine(`${toCamelCase(model.name)}!: ${model.name}IDBClass;`));
}

function addOutboxProperty(writer: CodeBlockWriter, outboxSync: boolean, outboxModelName: string) {
  if (!outboxSync) return;
  writer.writeLine(`$outbox!: ${outboxModelName}IDBClass;`);
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

function addInitializeMethod(
  writer: CodeBlockWriter,
  models: readonly Model[],
  outboxSync: boolean = false,
  outboxModelName: string = "OutboxEvent",
) {
  writer.writeLine(`private async initialize()`).block(() => {
    writer
      .writeLine(`this._db = await openDB<PrismaIDBSchema>("prisma-idb", IDB_VERSION, `)
      .block(() => {
        writer.writeLine(`upgrade(db) `).block(() => {
          models.forEach((model) => addObjectStoreInitialization(model, writer));
          if (outboxSync) {
            addOutboxObjectStoreInitialization(writer, outboxModelName);
          }
        });
      })
      .writeLine(`);`);

    models.forEach((model) => {
      writer.writeLine(
        `this.${toCamelCase(model.name)} = new ${model.name}IDBClass(this, ${getUniqueIdentifiers(model)[0].keyPath});`,
      );
    });

    if (outboxSync) {
      writer.writeLine(
        `this.$outbox = new ${outboxModelName}IDBClass(this, ['id']);`,
      );
    }
  });
}

function addShouldTrackModelMethod(writer: CodeBlockWriter) {
  writer
    .writeLine(`shouldTrackModel(modelName: string): boolean`)
    .block(() => {
      writer.writeLine(`return this.outboxEnabled && this.includedModels.has(modelName);`);
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

function addOutboxObjectStoreInitialization(writer: CodeBlockWriter, outboxModelName: string) {
  writer.writeLine(`db.createObjectStore('${outboxModelName}', { keyPath: 'id' });`);
}

function addResetDatabaseMethod(writer: CodeBlockWriter) {
  writer.writeLine(`public async resetDatabase()`).block(() => {
    writer
      .writeLine(`this._db.close();`)
      .writeLine(`window.indexedDB.deleteDatabase("prisma-idb");`)
      .writeLine(`await PrismaIDBClient.instance.initialize();`);
  });
}
