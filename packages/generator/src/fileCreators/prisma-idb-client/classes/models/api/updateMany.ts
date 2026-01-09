import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers } from "../../../../../helpers/utils";
import { getOptionsParameterWrite, getOptionsSetupWrite } from "../helpers/methodOptions";

/**
 * Writes an async `updateMany` method for the specified model into the given CodeBlockWriter.
 *
 * The generated method accepts a Prisma-style `query` and an `options` object (`tx?: IDBUtils.ReadwriteTransactionType`, `silent?: boolean`, `addToOutbox?: boolean`), ensures or creates a read/write transaction, loads matching records via `findMany`, performs per-record `update` operations in parallel (handling single-field and composite primary keys), and returns an object with the updated `count`.
 *
 * @param writer - Destination CodeBlockWriter to emit the method code into
 * @param model - Model metadata used to shape the generated `updateMany` implementation
 */
export function addUpdateMany(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async updateMany<Q extends Prisma.Args<Prisma.${model.name}Delegate, "updateMany">>(`)
    .writeLine(`query: Q,`)
    .write(getOptionsParameterWrite())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "updateMany">>`)
    .block(() => {
      writer.write(getOptionsSetupWrite());
      const pk = getUniqueIdentifiers(model)[0];
      const keyPath = JSON.parse(pk.keyPath) as string[];
      writer
        .write(`tx = tx ?? this.client._db.transaction(`)
        .writeLine(`Array.from(this._getNeededStoresForFind(query)), "readwrite");`)
        .writeLine(`const records = await this.findMany({ where: query.where }, { tx });`)
        .writeLine(`await Promise.all(`)
        .writeLine(`records.map(async (record) =>`)
        .block(() => {
          if (keyPath.length === 1) {
            writer.writeLine(
              `await this.update({ where: { ${pk.name}: record.${keyPath[0]} }, data: query.data }, { tx, silent, addToOutbox });`,
            );
          } else {
            const compositeKey = keyPath.map((field) => `${field}: record.${field}`).join(", ");
            writer.writeLine(
              `await this.update({ where: { ${pk.name}: { ${compositeKey} } }, data: query.data }, { tx, silent, addToOutbox });`,
            );
          }
        })
        .writeLine(`));`)
        .writeLine(`return { count: records.length };`);
    });
}