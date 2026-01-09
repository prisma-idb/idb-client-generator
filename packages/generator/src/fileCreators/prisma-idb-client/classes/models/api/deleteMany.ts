import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers } from "../../../../../helpers/utils";
import { getOptionsParameterWrite, getOptionsSetupWrite } from "../helpers/methodOptions";

/**
 * Emits an async `deleteMany` method for the given model into the provided code writer.
 *
 * Generates a method that initializes options and a transaction, retrieves matching records,
 * issues per-record deletes, and returns an object with the number of deleted records.
 *
 * @param writer - CodeBlockWriter used to write the method source
 * @param model - Model metadata describing the Prisma model to generate the method for
 */
export function addDeleteManyMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async deleteMany<Q extends Prisma.Args<Prisma.${model.name}Delegate, "deleteMany">>(`)
    .writeLine(`query?: Q,`)
    .write(getOptionsParameterWrite())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "deleteMany">>`)
    .block(() => {
      writer.write(getOptionsSetupWrite());
      createTxAndGetRecord(writer);
      deleteRecords(writer, model);
      writer.writeLine(`return { count: records.length };`);
    });
}

/**
 * Emit code that determines required stores for the delete query, ensures nested-delete stores are included, initializes a read/write transaction when one is not provided, and retrieves the records to be deleted.
 *
 * @param writer - The code writer used to emit the statements
 */
function createTxAndGetRecord(writer: CodeBlockWriter) {
  writer
    .writeLine(`const storesNeeded = this._getNeededStoresForFind(query);`)
    .writeLine(`this._getNeededStoresForNestedDelete(storesNeeded);`)
    .writeLine(`tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");`)
    .writeLine(`const records = await this.findMany(query, { tx });`);
}

/**
 * Writes a loop that deletes each fetched record for the given model using its primary key.
 *
 * The generated loop calls `this.delete` for every `record` and supplies `{ tx, silent, addToOutbox }`
 * as the deletion options. For a single-field primary key the call uses the key field directly;
 * for a composite primary key the call constructs an object of the key fields and their values.
 *
 * @param writer - The CodeBlockWriter used to emit code lines and blocks
 * @param model - Model metadata used to determine the primary key fields to generate the delete qualifier
 */
function deleteRecords(writer: CodeBlockWriter, model: Model) {
  const pk = getUniqueIdentifiers(model)[0];
  const keyPath = JSON.parse(pk.keyPath) as string[];
  writer.writeLine(`for (const record of records)`).block(() => {
    if (keyPath.length === 1) {
      writer.writeLine(
        `await this.delete({ where: { ${pk.name}: record.${keyPath[0]} } }, { tx, silent, addToOutbox });`,
      );
    } else {
      const compositeKey = keyPath.map((field) => `${field}: record.${field}`).join(", ");
      writer.writeLine(
        `await this.delete({ where: { ${pk.name}: { ${compositeKey} } } }, { tx, silent, addToOutbox });`,
      );
    }
  });
}