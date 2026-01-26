import { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

export function addIntUpdateHandler(writer: CodeBlockWriter, models: readonly Model[]) {
  const intFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "Int");
  if (intFields.length === 0) return;

  let updateOperationType = "undefined | number";
  let fieldType = "number";

  const nonNullableIntFieldPresent = intFields.some(({ isRequired }) => isRequired);
  const nullableIntFieldPresent = intFields.some(({ isRequired }) => !isRequired);

  if (nonNullableIntFieldPresent) {
    updateOperationType += " | Prisma.IntFieldUpdateOperationsInput";
  }
  if (nullableIntFieldPresent) {
    updateOperationType += " | null | Prisma.NullableIntFieldUpdateOperationsInput";
    fieldType += " | null";
  }

  writer
    .writeLine(
      `export function handleIntUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, intUpdate: ${updateOperationType}): void`,
    )
    .block(() => {
      writer
        .writeLine(`if (intUpdate === undefined) return;`)
        .writeLine(`if (typeof intUpdate === "number"${nullableIntFieldPresent ? ` || intUpdate === null` : ""})`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = intUpdate;`);
        })
        .writeLine(`else if (intUpdate.set !== undefined)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = intUpdate.set;`);
        })
        .writeLine(`else if (intUpdate.increment !== undefined && record[fieldName] !== null)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as number) += intUpdate.increment;`);
        })
        .writeLine(`else if (intUpdate.decrement !== undefined && record[fieldName] !== null)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as number) -= intUpdate.decrement;`);
        })
        .writeLine(`else if (intUpdate.multiply !== undefined && record[fieldName] !== null)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as number) *= intUpdate.multiply;`);
        })
        .writeLine(`else if (intUpdate.divide !== undefined && record[fieldName] !== null)`)
        .block(() => {
          writer.writeLine(
            `(record[fieldName] as number) = Math.trunc((record[fieldName] as number) / intUpdate.divide);`,
          );
        });
    });
}
