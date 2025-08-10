import { CodeBlockWriter } from "ts-morph";
import { Model } from "../../../../../fileCreators/types";

export function addFindUniqueOrThrow(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async findUniqueOrThrow<Q extends Prisma.Args<Prisma.${model.name}Delegate, "findUniqueOrThrow">>(`)
    .writeLine(`query: Q,`)
    .writeLine(`tx?: IDBUtils.TransactionType,`)
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "findUniqueOrThrow">>`)
    .block(() => {
      writer
        .writeLine(
          `tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");`,
        )
        .writeLine(`const record = await this.findUnique(query, tx);`)
        .writeLine(`if (!record)`)
        .block(() => {
          writer.writeLine(`tx.abort();`).writeLine(`throw new Error("Record not found");`);
        })
        .writeLine(`return record;`);
    });
}
