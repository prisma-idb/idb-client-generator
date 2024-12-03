import { Model } from "src/fileCreators/types";
import type { SourceFile } from "ts-morph";

// TODO: atomic operations

export function addIntUpdateHandler(utilsFile: SourceFile, models: readonly Model[]) {
  const intFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "Int");
  if (intFields.length === 0) return;

  let updateOperationType = "undefined | number | Prisma.IntFieldUpdateOperationsInput";
  let fieldType = "number";

  const nullableIntFieldPresent = intFields.some(({ isRequired }) => !isRequired);
  if (nullableIntFieldPresent) {
    updateOperationType += " | null | Prisma.NullableIntFieldUpdateOperationsInput";
    fieldType += " | null";
  }

  utilsFile.addFunction({
    name: "handleIntUpdateField",
    isExported: true,
    typeParameters: [{ name: "T" }, { name: "R", constraint: `Prisma.Result<T, object, "findFirstOrThrow">` }],
    parameters: [
      { name: "record", type: `R` },
      { name: "fieldName", type: "keyof R" },
      {
        name: "intUpdate",
        type: updateOperationType,
      },
    ],
    statements: (writer) => {
      writer
        .writeLine(`if (intUpdate === undefined) return;`)
        .write(`if (typeof intUpdate === "number"`)
        .conditionalWrite(nullableIntFieldPresent, ` || intUpdate === null`)
        .writeLine(`)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = intUpdate;`);
        });
      writer.writeLine(`else if (intUpdate.set !== undefined)`).block(() => {
        writer.writeLine(`(record[fieldName] as ${fieldType}) = intUpdate.set;`);
      });
    },
  });
}
