import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getOptionsParameter, getOptionsSetup } from "../helpers/methodOptions";

// TODO: skipDuplicates

export function addCreateManyMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async createMany<Q extends Prisma.Args<Prisma.${model.name}Delegate, "createMany">>(`)
    .writeLine(`query: Q,`)
    .write(getOptionsParameter(true))
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "createMany">>`)
    .block(() => {
      writer.write(getOptionsSetup());
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
      .writeLine(`await this.emit("create", keyPath, undefined, record, silent, addToOutbox);`);
  });
}

function returnCount(writer: CodeBlockWriter) {
  writer.writeLine(`return { count: createManyData.length };`);
}
