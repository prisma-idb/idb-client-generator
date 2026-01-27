import { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

export function addStringUpdateHandler(writer: CodeBlockWriter, models: readonly Model[]) {
  const stringFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "String");
  if (stringFields.length === 0) return;

  let updateOperationType = "undefined | string";
  let fieldType = "string";

  const nonNullableStringFieldPresent = stringFields.some(({ isRequired }) => isRequired);
  const nullableStringFieldPresent = stringFields.some(({ isRequired }) => !isRequired);

  if (nonNullableStringFieldPresent) {
    updateOperationType += " | Prisma.StringFieldUpdateOperationsInput";
  }
  if (nullableStringFieldPresent) {
    updateOperationType += " | null | Prisma.NullableStringFieldUpdateOperationsInput";
    fieldType += " | null";
  }

  writer
    .writeLine(
      `export function handleStringUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, stringUpdate: ${updateOperationType}): void`
    )
    .block(() => {
      writer
        .writeLine(`if (stringUpdate === undefined) return;`)
        .writeLine(
          `if (typeof stringUpdate === "string"${nullableStringFieldPresent ? ` || stringUpdate === null` : ""})`
        )
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = stringUpdate;`);
        });
      writer.writeLine(`else if (stringUpdate.set !== undefined)`).block(() => {
        writer.writeLine(`(record[fieldName] as ${fieldType}) = stringUpdate.set;`);
      });
    });
}
