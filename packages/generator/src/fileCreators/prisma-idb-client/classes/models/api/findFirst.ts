import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getOptionsParameterRead } from "../helpers/methodOptions";

export function addFindFirstMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async findFirst<Q extends Prisma.Args<Prisma.${model.name}Delegate, "findFirst">>(`)
    .writeLine(`query?: Q,`)
    .write(getOptionsParameterRead())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "findFirst">>`)
    .block(() => {
      writer
        .writeLine(`const { tx: txOption } = options ?? {};`)
        .writeLine(`let tx = txOption;`)
        .writeLine(
          `tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");`,
        )
        .writeLine(`return (await this.findMany(query, { tx }))[0] ?? null;`);
    });
}
