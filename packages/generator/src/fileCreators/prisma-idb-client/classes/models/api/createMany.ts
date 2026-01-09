import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getOptionsParameterWrite, getOptionsSetupWrite } from "../helpers/methodOptions";

/**
 * Emit a TypeScript async `createMany` method for the specified model into the given writer.
 *
 * The generated method normalizes input to an array, prepares a read/write transaction for the
 * model's store, processes and inserts each record while emitting per-record "create" events,
 * and returns an object with the number of processed items.
 *
 * @param writer - The CodeBlockWriter to write the method source into
 * @param model - Model metadata used to tailor the generated method for the specific store
 */

export function addCreateManyMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async createMany<Q extends Prisma.Args<Prisma.${model.name}Delegate, "createMany">>(`)
    .writeLine(`query: Q,`)
    .write(getOptionsParameterWrite())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "createMany">>`)
    .block(() => {
      writer.write(getOptionsSetupWrite());
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

/**
 * Writes a loop that persists each item in `createManyData` and emits a create event within the current transaction.
 *
 * @param writer - The CodeBlockWriter used to emit the generated TypeScript code
 * @param model - The model whose object store name is used for inserts
 */
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