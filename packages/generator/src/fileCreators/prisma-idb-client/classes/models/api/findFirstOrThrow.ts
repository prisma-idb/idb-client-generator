import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getOptionsParameterRead } from "../helpers/methodOptions";

/**
 * Writes a TypeScript `findFirstOrThrow` method implementation for the specified Prisma model into the provided writer.
 *
 * @param writer - CodeBlockWriter used to emit the method source
 * @param model - Model metadata used to specialize the generated method for the target Prisma delegate
 */
export function addFindFirstOrThrow(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async findFirstOrThrow<Q extends Prisma.Args<Prisma.${model.name}Delegate, "findFirstOrThrow">>(`)
    .writeLine(`query?: Q,`)
    .write(getOptionsParameterRead())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "findFirstOrThrow">>`)
    .block(() => {
      writer
        .writeLine(`const { tx: txOption } = options ?? {};`)
        .writeLine(`const localCreatedTx = txOption == null;`)
        .writeLine(`let tx = txOption;`)
        .writeLine(
          `tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");`,
        )
        .writeLine(`const record = await this.findFirst(query, { ...(options ?? {}), tx });`)
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