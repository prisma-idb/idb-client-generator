import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getOptionsParameterRead } from "../helpers/methodOptions";

/**
 * Generates an async `count` method implementation for the specified Prisma model and writes it to the provided CodeBlockWriter.
 *
 * @param writer - CodeBlockWriter used to emit the generated method source
 * @param model - Model descriptor for which the `count` method is generated
 */
export function addCountMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async count<Q extends Prisma.Args<Prisma.${model.name}Delegate, "count">>(`)
    .writeLine(`query?: Q,`)
    .write(getOptionsParameterRead())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "count">>`)
    .block(() => {
      writer
        .writeLine(`const { tx: txOption } = options ?? {};`)
        .writeLine(`let tx = txOption;`)
        .writeLine(`tx = tx ?? this.client._db.transaction(["${model.name}"], "readonly");`);
      handleWithoutSelect(writer, model);
      handleWithSelect(writer, model);
    });
}

/**
 * Writes an if-block that handles counting when no `select` projection is provided or `select` is `true`.
 *
 * @param writer - CodeBlockWriter used to emit the generated code
 * @param model - Model descriptor for which the count logic is generated
 */
function handleWithoutSelect(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`if (!query?.select || query.select === true)`).block(() => {
    writer
      .writeLine(`const records = await this.findMany({ where: query?.where }, { tx });`)
      .writeLine(`return records.length as Prisma.Result<Prisma.${model.name}Delegate, Q, "count">;`);
  });
}

/**
 * Emits TypeScript code that implements count logic for explicit `select` projections.
 *
 * Writes a partial `result` object and a loop over `query.select` keys that:
 * - counts all matching records when the selected key is `"_all"`,
 * - otherwise counts non-null values for the selected field,
 * then returns the `result` cast to the appropriate Prisma `count` result type for the provided model.
 *
 * @param writer - CodeBlockWriter used to emit the generated code
 * @param model - Model metadata used to reference the model-specific Prisma types in the generated code
 */
function handleWithSelect(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`const result: Partial<Record<keyof Prisma.${model.name}CountAggregateInputType, number>> = {};`)
    .writeLine(`for (const key of Object.keys(query.select))`)
    .block(() => {
      writer
        .writeLine(`const typedKey = key as keyof typeof query.select;`)
        .writeLine(`if (typedKey === "_all")`)
        .block(() => {
          writer
            .writeLine(`result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;`)
            .writeLine(`continue;`);
        })
        .writeLine(
          "result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;",
        );
    })
    .writeLine(`return result as Prisma.Result<Prisma.${model.name}Delegate, Q, "count">;`);
}