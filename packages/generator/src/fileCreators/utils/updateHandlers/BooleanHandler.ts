import { Model } from "src/fileCreators/types";
import type { SourceFile } from "ts-morph";

export function addBooleanUpdateHandler(utilsFile: SourceFile, models: readonly Model[]) {
  const booleanFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "Boolean");
  if (booleanFields.length === 0) return;

  let updateOperationType = "undefined | boolean | Prisma.BoolFieldUpdateOperationsInput";
  let fieldType = "boolean";

  const nullableBooleanFieldPresent = booleanFields.some(({ isRequired }) => !isRequired);
  if (nullableBooleanFieldPresent) {
    updateOperationType += " | null | Prisma.NullableBoolFieldUpdateOperationsInput";
    fieldType += " | null";
  }

  utilsFile.addFunction({
    name: "handleBooleanUpdateField",
    isExported: true,
    typeParameters: [{ name: "T" }, { name: "R", constraint: `Prisma.Result<T, object, "findFirstOrThrow">` }],
    parameters: [
      { name: "record", type: `R` },
      { name: "fieldName", type: "keyof R" },
      {
        name: "booleanUpdate",
        type: updateOperationType,
      },
    ],
    statements: (writer) => {
      writer
        .writeLine(`if (booleanUpdate === undefined) return;`)
        .write(`if (typeof booleanUpdate === "boolean"`)
        .conditionalWrite(nullableBooleanFieldPresent, ` || booleanUpdate === null`)
        .writeLine(`)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = booleanUpdate;`);
        });
      writer
        .writeLine(`else if (booleanUpdate.set !== undefined)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = booleanUpdate.set;`);
        })
        .writeLine(`return true;`);
    },
  });
}
