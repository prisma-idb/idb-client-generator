import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getOptionsParameterRead, getOptionsSetupRead } from "../helpers/methodOptions";

export function addFindFirstOrThrow(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async findFirstOrThrow<Q extends Prisma.Args<Prisma.${model.name}Delegate, "findFirstOrThrow">>(`)
    .writeLine(`query?: Q,`)
    .write(getOptionsParameterRead())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "findFirstOrThrow">>`)
    .block(() => {
      writer
        .writeLine(getOptionsSetupRead())
        .writeLine(
          `tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");`
        )
        .writeLine(`const record = await this.findFirst(query, { tx });`)
        .writeLine(`if (!record)`)
        .block(() => {
          writer.writeLine(`throw new Error("Record not found");`);
        })
        .writeLine(`return record;`);
    });
}
