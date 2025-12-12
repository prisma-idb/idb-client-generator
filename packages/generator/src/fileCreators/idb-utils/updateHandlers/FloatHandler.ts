import type { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

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

  writer.writeLine(`export function handleFloatUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, floatUpdate: ${updateOperationType}): void`).block(() => {
    writer
      .writeLine(`if (floatUpdate === undefined) return;`)
      .writeLine(`if (typeof floatUpdate === "number"${nullableFloatFieldPresent ? ` || floatUpdate === null` : ""})`)
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
