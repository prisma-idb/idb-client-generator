import { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

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
    .writeLine(
      `export function handleBooleanUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, booleanUpdate: ${updateOperationType}): void`,
    )
    .block(() => {
      writer
        .writeLine(`if (booleanUpdate === undefined) return;`)
        .writeLine(
          `if (typeof booleanUpdate === "boolean"${nullableBooleanFieldPresent ? ` || booleanUpdate === null` : ""})`,
        )
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = booleanUpdate;`);
        });
      writer.writeLine(`else if (booleanUpdate.set !== undefined)`).block(() => {
        writer.writeLine(`(record[fieldName] as ${fieldType}) = booleanUpdate.set;`);
      });
    });
}
