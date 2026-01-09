import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getOptionsParameter } from "../helpers/methodOptions";

export function addFindUniqueOrThrow(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async findUniqueOrThrow<Q extends Prisma.Args<Prisma.${model.name}Delegate, "findUniqueOrThrow">>(`)
    .writeLine(`query: Q,`)
    .write(getOptionsParameter(false))
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "findUniqueOrThrow">>`)
    .block(() => {
      writer
        .writeLine(`const { tx: txOption } = options ?? {};`)
        .writeLine(`const localCreatedTx = txOption == null;`)
        .writeLine(`let tx = txOption;`)
        .writeLine(
          `tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");`,
        )
        .writeLine(`const record = await this.findUnique(query, { ...(options ?? {}), tx });`)
        .writeLine(`if (!record)`)
        .block(() => {
          writer
            .writeLine(`if (localCreatedTx) {`)
            .writeLine(`  try {`)
            .writeLine(`    tx.abort();`)
            .writeLine(`  } catch {`)
            .writeLine(`    // Transaction may already be inactive`)
            .writeLine(`  }`)
            .writeLine(`}`)
            .writeLine(`throw new Error("Record not found");`);
        })
        .writeLine(`return record;`);
    });
}
