import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getOptionsParameterWrite, getOptionsSetupWrite } from "../helpers/methodOptions";

// TODO: skipDuplicates

export function addCreateManyMethod(writer: CodeBlockWriter, model: Model, outboxSync: boolean) {
  writer
    .writeLine(`async createMany<Q extends Prisma.Args<Prisma.${model.name}Delegate, "createMany">>(`)
    .writeLine(`query: Q,`)
    .write(getOptionsParameterWrite())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "createMany">>`)
    .block(() => {
      writer.write(getOptionsSetupWrite());
      setupDataAndTx(writer, model, outboxSync);
      addTransactionalHandling(writer, model);
      returnCount(writer);
    });
}

function setupDataAndTx(writer: CodeBlockWriter, model: Model, outboxSync: boolean) {
  writer
    .writeLine("const createManyData = IDBUtils.convertToArray(query.data);")
    .writeLine(`const storesNeeded: Set<StoreNames<PrismaIDBSchema>> = new Set(["${model.name}"]);`);
  if (outboxSync) {
    writer
      .writeLine(`if (addToOutbox !== false && this.client.shouldTrackModel(this.modelName)) {`)
      .writeLine(`storesNeeded.add("OutboxEvent");`)
      .writeLine(`storesNeeded.add("VersionMeta");`)
      .writeLine(`}`);
  }
  writer.writeLine(`tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");`);
}

function addTransactionalHandling(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`for (const createData of createManyData)`).block(() => {
    writer
      .writeLine(`const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));`)
      .writeLine(`const keyPath = await tx.objectStore("${model.name}").add(record);`)
      .writeLine(`await this.emit("create", keyPath, undefined, record, { silent, addToOutbox, tx });`);
  });
}

function returnCount(writer: CodeBlockWriter) {
  writer.writeLine(`return { count: createManyData.length };`);
}
