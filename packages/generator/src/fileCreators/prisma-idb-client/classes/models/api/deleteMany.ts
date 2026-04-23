import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getOptionsParameterWrite, getOptionsSetupWrite } from "../helpers/methodOptions";

export function addDeleteManyMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async deleteMany<Q extends Prisma.Args<Prisma.${model.name}Delegate, "deleteMany">>(`)
    .writeLine(`query?: Q,`)
    .write(getOptionsParameterWrite())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "deleteMany">>`)
    .block(() => {
      writer.write(getOptionsSetupWrite());
      createTxAndGetRecords(writer);
      deleteRecords(writer);
      writer.writeLine(`return { count: records.length };`);
    });
}

function createTxAndGetRecords(writer: CodeBlockWriter) {
  writer
    .writeLine(`const storesNeeded = this._getNeededStoresForFind(query);`)
    .writeLine(`this._getNeededStoresForNestedDelete(storesNeeded);`)
    .writeLine(`tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");`)
    .writeLine(`const records = await this.findMany(query, { tx });`);
}

function deleteRecords(writer: CodeBlockWriter) {
  writer
    .writeLine(`await Promise.all(`)
    .writeLine(`records.map((record) => this._deleteRecord(record, tx, { silent, addToOutbox }))`)
    .writeLine(`);`);
}
