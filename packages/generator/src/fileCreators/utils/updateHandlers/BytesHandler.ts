import { Model } from "src/fileCreators/types";
import type { SourceFile } from "ts-morph";

export function addBytesUpdateHandler(utilsFile: SourceFile, models: readonly Model[]) {
  const bytesFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "Bytes");
  if (bytesFields.length === 0) return;

  let updateOperationType = "undefined | Buffer | Prisma.BytesFieldUpdateOperationsInput";
  let fieldType = "Buffer";

  const nullableBytesFieldPresent = bytesFields.some(({ isRequired }) => !isRequired);
  if (nullableBytesFieldPresent) {
    updateOperationType += " | null | Prisma.NullableBytesFieldUpdateOperationsInput";
    fieldType += " | null";
  }

  utilsFile.addFunction({
    name: "handleBytesUpdateField",
    isExported: true,
    typeParameters: [{ name: "T" }, { name: "R", constraint: `Prisma.Result<T, object, "findFirstOrThrow">` }],
    parameters: [
      { name: "record", type: `R` },
      { name: "fieldName", type: "keyof R" },
      {
        name: "bytesUpdate",
        type: updateOperationType,
      },
    ],
    statements: (writer) => {
      writer
        .writeLine(`if (bytesUpdate === undefined) return;`)
        .write(`if (Buffer.isBuffer(bytesUpdate)`)
        .conditionalWrite(nullableBytesFieldPresent, ` || bytesUpdate === null`)
        .writeLine(`)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = bytesUpdate;`);
        });
      writer
        .writeLine(`else if (bytesUpdate.set !== undefined)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = bytesUpdate.set;`);
        })
    },
  });
}
