import type { Model } from "src/fileCreators/types";
import type { CodeBlockWriter } from "ts-morph";

export function addFloatUpdateHandler(writer: CodeBlockWriter, models: readonly Model[]) {
  const floatFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "Float");
  if (floatFields.length === 0) return;

  let updateOperationType = "undefined | number";
  let fieldType = "number";

  const nonNullableFloatFieldPresent = floatFields.some(({ isRequired }) => isRequired);
  const nullableFloatFieldPresent = floatFields.some(({ isRequired }) => !isRequired);

  if (nonNullableFloatFieldPresent) {
    updateOperationType += " | Prisma.FloatFieldUpdateOperationsInput";
  }
  if (nullableFloatFieldPresent) {
    updateOperationType += " | null | Prisma.NullableFloatFieldUpdateOperationsInput";
    fieldType += " | null";
  }

  writer
    .writeLine(`export function handleFloatUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(`)
    .writeLine(`record: R,`)
    .writeLine(`fieldName: keyof R,`)
    .writeLine(`floatUpdate: ${updateOperationType},`)
    .writeLine(`): void`)
    .block(() => {
      writer
        .writeLine(`if (floatUpdate === undefined) return;`)
        .write(`if (typeof floatUpdate === "number"`)
        .conditionalWrite(nullableFloatFieldPresent, ` || floatUpdate === null`)
        .writeLine(`)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = floatUpdate;`);
        })
        .writeLine(`else if (floatUpdate.set !== undefined)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = floatUpdate.set;`);
        })
        .writeLine(`else if (floatUpdate.increment !== undefined && record[fieldName] !== null)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as number) += floatUpdate.increment;`);
        })
        .writeLine(`else if (floatUpdate.decrement !== undefined && record[fieldName] !== null)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as number) -= floatUpdate.decrement;`);
        })
        .writeLine(`else if (floatUpdate.multiply !== undefined && record[fieldName] !== null)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as number) *= floatUpdate.multiply;`);
        })
        .writeLine(`else if (floatUpdate.divide !== undefined && record[fieldName] !== null)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as number) /= floatUpdate.divide;`);
        });
    });
}
