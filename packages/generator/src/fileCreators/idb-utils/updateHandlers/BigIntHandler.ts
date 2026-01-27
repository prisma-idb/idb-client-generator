import { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

export function addBigIntUpdateHandler(writer: CodeBlockWriter, models: readonly Model[]) {
  const bigIntFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "BigInt");
  if (bigIntFields.length === 0) return;

  let updateOperationType = "undefined | bigint | number";
  let fieldType = "bigint";

  const nonNullableBigIntFieldPresent = bigIntFields.some(({ isRequired }) => isRequired);
  const nullableBigIntFieldPresent = bigIntFields.some(({ isRequired }) => !isRequired);

  if (nonNullableBigIntFieldPresent) {
    updateOperationType += " | Prisma.BigIntFieldUpdateOperationsInput";
  }
  if (nullableBigIntFieldPresent) {
    updateOperationType += " | null | Prisma.NullableBigIntFieldUpdateOperationsInput";
    fieldType += " | null";
  }

  writer
    .writeLine(
      `export function handleBigIntUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, bigIntUpdate: ${updateOperationType}): void`
    )
    .block(() => {
      writer
        .writeLine(`if (bigIntUpdate === undefined) return;`)
        .writeLine(
          `if (typeof bigIntUpdate === "bigint" || typeof bigIntUpdate === "number"${nullableBigIntFieldPresent ? ` || bigIntUpdate === null` : ""})`
        )
        .block(() => {
          if (nullableBigIntFieldPresent) {
            writer.writeLine(
              `(record[fieldName] as ${fieldType}) = bigIntUpdate === null ? null : BigInt(bigIntUpdate);`
            );
          } else {
            writer.writeLine(`(record[fieldName] as ${fieldType}) = BigInt(bigIntUpdate);`);
          }
        })
        .writeLine(`else if (bigIntUpdate.set !== undefined)`)
        .block(() => {
          if (nullableBigIntFieldPresent) {
            writer.writeLine(
              `(record[fieldName] as ${fieldType}) = bigIntUpdate.set === null ? null : BigInt(bigIntUpdate.set);`
            );
          } else {
            writer.writeLine(`(record[fieldName] as ${fieldType}) = BigInt(bigIntUpdate.set);`);
          }
        })
        .writeLine(`else if (bigIntUpdate.increment !== undefined && record[fieldName] !== null)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as bigint) += BigInt(bigIntUpdate.increment);`);
        })
        .writeLine(`else if (bigIntUpdate.decrement !== undefined && record[fieldName] !== null)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as bigint) -= BigInt(bigIntUpdate.decrement);`);
        })
        .writeLine(`else if (bigIntUpdate.multiply !== undefined && record[fieldName] !== null)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as bigint) *= BigInt(bigIntUpdate.multiply);`);
        })
        .writeLine(`else if (bigIntUpdate.divide !== undefined && record[fieldName] !== null)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as bigint) /= BigInt(bigIntUpdate.divide);`);
        });
    });
}
