import { CodeBlockWriter } from "ts-morph";
import { Model } from "../../../../../fileCreators/types";

export function addFindFirstOrThrow(writer: CodeBlockWriter, model: Model, autoDeletedAtFilter: boolean) {
  writer
    .writeLine(`async findFirstOrThrow<Q extends Prisma.Args<Prisma.${model.name}Delegate, "findFirstOrThrow">>(`)
    .writeLine(`query?: Q,`)
    .writeLine(`options?: `)
    .block(() => {
      writer
        .writeLine(`tx?: IDBUtils.TransactionType,`)
        .conditionalWriteLine(autoDeletedAtFilter, `skipAutoDeletedAtFilter?: boolean`);
    })
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "findFirstOrThrow">>`)
    .block(() => {
      writer
        .writeLine(
          `const tx = options?.tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");`,
        )
        .writeLine(`const record = await this.findFirst(query, { tx });`)
        .writeLine(`if (!record)`)
        .block(() => {
          writer.writeLine(`tx.abort();`).writeLine(`throw new Error("Record not found");`);
        })
        .writeLine(`return record;`);
    });
}
