import { Model } from "src/fileCreators/types";
import type { SourceFile } from "ts-morph";

export function addDateTimeUpdateHandler(utilsFile: SourceFile, models: readonly Model[]) {
  const dateTimeFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "DateTime");
  if (dateTimeFields.length === 0) return;

  let updateOperationType = "undefined | Date | string";
  let fieldType = "Date";

  const nonNullableDateTimeFieldPresent = dateTimeFields.some(({ isRequired }) => isRequired);
  const nullableDateTimeFieldPresent = dateTimeFields.some(({ isRequired }) => !isRequired);

  if (nonNullableDateTimeFieldPresent) {
    updateOperationType += " | Prisma.DateTimeFieldUpdateOperationsInput";
  }
  if (nullableDateTimeFieldPresent) {
    updateOperationType += " | null | Prisma.NullableDateTimeFieldUpdateOperationsInput";
    fieldType += " | null";
  }

  utilsFile.addFunction({
    name: "handleDateTimeUpdateField",
    isExported: true,
    typeParameters: [{ name: "T" }, { name: "R", constraint: `Prisma.Result<T, object, "findFirstOrThrow">` }],
    parameters: [
      { name: "record", type: `R` },
      { name: "fieldName", type: "keyof R" },
      {
        name: "dateTimeUpdate",
        type: updateOperationType,
      },
    ],
    statements: (writer) => {
      writer
        .writeLine(`if (dateTimeUpdate === undefined) return;`)
        .write(`if (typeof dateTimeUpdate === "string" || dateTimeUpdate instanceof Date`)
        .conditionalWrite(nullableDateTimeFieldPresent, ` || dateTimeUpdate === null`)
        .writeLine(`)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = new Date(dateTimeUpdate);`);
        });
      writer.writeLine(`else if (dateTimeUpdate.set !== undefined)`).block(() => {
        writer.writeLine(`(record[fieldName] as ${fieldType}) = new Date(dateTimeUpdate.set);`);
      });
    },
  });
}
