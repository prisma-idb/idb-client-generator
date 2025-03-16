import { Model } from "src/fileCreators/types";
import type { SourceFile } from "ts-morph";

export function addEnumUpdateHandler(utilsFile: SourceFile, models: readonly Model[]) {
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

  utilsFile.addFunction({
    name: "handleEnumUpdateField",
    isExported: true,
    typeParameters: [{ name: "T" }, { name: "R", constraint: `Prisma.Result<T, object, "findFirstOrThrow">` }],
    parameters: [
      { name: "record", type: `R` },
      { name: "fieldName", type: "keyof R" },
      {
        name: "enumUpdate",
        type: updateOperationType,
      },
    ],
    statements: (writer) => {
      writer
        .writeLine(`if (enumUpdate === undefined) return;`)
        .write(`if (typeof enumUpdate === "string"`)
        .conditionalWrite(nullableEnumFieldPresent, ` || enumUpdate === null`)
        .writeLine(`)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = enumUpdate;`);
        });
      writer.writeLine(`else if (enumUpdate.set !== undefined)`).block(() => {
        writer.writeLine(`(record[fieldName] as ${fieldType}) = enumUpdate.set;`);
      });
    },
  });
}
