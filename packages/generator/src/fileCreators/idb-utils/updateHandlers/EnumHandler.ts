import { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

export function addEnumUpdateHandler(writer: CodeBlockWriter, models: readonly Model[]) {
  const enumFields = models.flatMap(({ fields }) => fields).filter((field) => field.kind === "enum" && !field.isList);
  if (enumFields.length === 0) return;

  let updateOperationType = "undefined | string";
  let fieldType = "string";

  const nonNullableEnumFieldPresent = enumFields.some(({ isRequired }) => isRequired);
  const nullableEnumFieldPresent = enumFields.some(({ isRequired }) => !isRequired);

  if (nonNullableEnumFieldPresent) {
    updateOperationType += " | { set?: string }";
  }
  if (nullableEnumFieldPresent) {
    updateOperationType += " | null | { set?: string | null }";
    fieldType += " | null";
  }

  writer
    .writeLine(
      `export function handleEnumUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, enumUpdate: ${updateOperationType}): void`,
    )
    .block(() => {
      writer
        .writeLine(`if (enumUpdate === undefined) return;`)
        .writeLine(`if (typeof enumUpdate === "string"${nullableEnumFieldPresent ? ` || enumUpdate === null` : ""})`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = enumUpdate;`);
        });
      writer.writeLine(`else if (enumUpdate.set !== undefined)`).block(() => {
        writer.writeLine(`(record[fieldName] as ${fieldType}) = enumUpdate.set;`);
      });
    });
}
