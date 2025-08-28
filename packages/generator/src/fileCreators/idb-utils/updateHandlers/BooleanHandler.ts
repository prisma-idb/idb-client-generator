import { Model } from "src/fileCreators/types";
import type { CodeBlockWriter } from "ts-morph";

export function addBooleanUpdateHandler(writer: CodeBlockWriter, models: readonly Model[]) {
  const booleanFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "Boolean");
  if (booleanFields.length === 0) return;

  let updateOperationType = "undefined | boolean";
  let fieldType = "boolean";

  const nonNullableBooleanFieldPresent = booleanFields.some(({ isRequired }) => isRequired);
  const nullableBooleanFieldPresent = booleanFields.some(({ isRequired }) => !isRequired);

  if (nonNullableBooleanFieldPresent) {
    updateOperationType += " | Prisma.BoolFieldUpdateOperationsInput";
  }
  if (nullableBooleanFieldPresent) {
    updateOperationType += " | null | Prisma.NullableBoolFieldUpdateOperationsInput";
    fieldType += " | null";
  }

  writer
    .writeLine(`export function handleBooleanUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(`)
    .writeLine(`  record: R,`)
    .writeLine(`  fieldName: keyof R,`)
    .writeLine(`  booleanUpdate: ${updateOperationType},`)
    .writeLine(`): void`)
    .block(() => {
      writer
        .writeLine(`if (booleanUpdate === undefined) return;`)
        .write(`if (typeof booleanUpdate === "boolean"`)
        .conditionalWrite(nullableBooleanFieldPresent, ` || booleanUpdate === null`)
        .writeLine(`)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = booleanUpdate;`);
        });
      writer.writeLine(`else if (booleanUpdate.set !== undefined)`).block(() => {
        writer.writeLine(`(record[fieldName] as ${fieldType}) = booleanUpdate.set;`);
      });
    });
}
