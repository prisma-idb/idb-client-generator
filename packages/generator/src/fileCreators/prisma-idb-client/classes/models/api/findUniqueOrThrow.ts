import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getOptionsParameterRead } from "../helpers/methodOptions";

/**
 * Emits an async `findUniqueOrThrow` method implementation for the specified model to the provided writer.
 *
 * The generated method fetches a unique record using the provided query, creates a read-only transaction when no transaction is supplied via options, aborts a locally created transaction (ignoring abort errors) and throws `Error("Record not found")` if no record is found, and returns the found record otherwise.
 *
 * @param writer - CodeBlockWriter to which the method implementation will be written
 * @param model - Model metadata used to specialize the method signature and result type
 */
export function addFindUniqueOrThrow(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async findUniqueOrThrow<Q extends Prisma.Args<Prisma.${model.name}Delegate, "findUniqueOrThrow">>(`)
    .writeLine(`query: Q,`)
    .write(getOptionsParameterRead())
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