import { CodeBlockWriter } from "ts-morph";
import { Model } from "../../../../../fileCreators/types";

// TODO: skipDuplicates

export function addCreateManyMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async createMany<Q extends Prisma.Args<Prisma.${model.name}Delegate, "createMany">>(`)
    .writeLine(`query: Q,`)
    .writeLine(`tx?: IDBUtils.ReadwriteTransactionType,`)
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "createMany">>`)
    .block(() => {
      setupDataAndTx(writer, model);
      addTransactionalHandling(writer, model);
      returnCount(writer);
    });
}

function setupDataAndTx(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine("const createManyData = IDBUtils.convertToArray(query.data);")
    .writeLine(`tx = tx ?? this.client._db.transaction(["${model.name}"], "readwrite");`);
}

function addTransactionalHandling(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`for (const createData of createManyData)`).block(() => {
    writer
      .writeLine(`const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));`)
      .writeLine(`const keyPath = await tx.objectStore("${model.name}").add(record);`)
      .writeLine(`this.emit("create", keyPath, undefined, record);`);
  });
}

function returnCount(writer: CodeBlockWriter) {
  writer.writeLine(`return { count: createManyData.length };`);
}
