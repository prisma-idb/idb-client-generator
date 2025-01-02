import type { Model } from "src/fileCreators/types";
import type { SourceFile } from "ts-morph";

export function addFloatUpdateHandler(utilsFile: SourceFile, models: readonly Model[]) {
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

  utilsFile.addFunction({
    name: "handleFloatUpdateField",
    isExported: true,
    typeParameters: [{ name: "T" }, { name: "R", constraint: `Prisma.Result<T, object, "findFirstOrThrow">` }],
    parameters: [
      { name: "record", type: `R` },
      { name: "fieldName", type: "keyof R" },
      {
        name: "floatUpdate",
        type: updateOperationType,
      },
    ],
    statements: (writer) => {
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
    },
  });
}
