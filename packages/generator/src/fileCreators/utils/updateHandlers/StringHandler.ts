import { Model } from "src/fileCreators/types";
import type { SourceFile } from "ts-morph";

export function addStringUpdateHandler(utilsFile: SourceFile, models: readonly Model[]) {
  const stringFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "String");
  if (stringFields.length === 0) return;

  let updateOperationType = "undefined | string | Prisma.StringFieldUpdateOperationsInput";
  let fieldType = "string";

  const nullableStringFieldPresent = stringFields.some(({ isRequired }) => !isRequired);
  if (nullableStringFieldPresent) {
    updateOperationType += " | null | Prisma.NullableStringFieldUpdateOperationsInput";
    fieldType += " | null";
  }

  utilsFile.addFunction({
    name: "handleStringUpdateField",
    isExported: true,
    typeParameters: [{ name: "T" }, { name: "R", constraint: `Prisma.Result<T, object, "findFirstOrThrow">` }],
    parameters: [
      { name: "record", type: `R` },
      { name: "fieldName", type: "keyof R" },
      {
        name: "stringUpdate",
        type: updateOperationType,
      },
    ],
    statements: (writer) => {
      writer
        .writeLine(`if (stringUpdate === undefined) return;`)
        .write(`if (typeof stringUpdate === "string"`)
        .conditionalWrite(nullableStringFieldPresent, ` || stringUpdate === null`)
        .writeLine(`)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = stringUpdate;`);
        });
      writer
        .writeLine(`else if (stringUpdate.set !== undefined)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = stringUpdate.set;`);
        })
        .writeLine(`return true;`);
    },
  });
}
