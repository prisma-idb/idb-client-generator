import { CodeBlockWriter } from "ts-morph";
import { Model } from "../../../../../fileCreators/types";

export function addFindFirstMethod(writer: CodeBlockWriter, model: Model, autoDeletedAtFilter: boolean) {
  writer
    .writeLine(`async findFirst<Q extends Prisma.Args<Prisma.${model.name}Delegate, "findFirst">>(`)
    .writeLine(`query?: Q,`)
    .writeLine(`options?: `)
    .block(() => {
      writer
        .writeLine(`tx?: IDBUtils.TransactionType,`)
        .conditionalWriteLine(autoDeletedAtFilter, `skipAutoDeletedAtFilter?: boolean`);
    })
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "findFirst">>`)
    .block(() => {
      writer
        .writeLine(
          `const tx = options?.tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");`,
        )
        .writeLine(`return (await this.findMany(query, { tx }))[0] ?? null;`);
    });
}
