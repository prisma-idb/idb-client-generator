import { Model } from "src/fileCreators/types";
import type { CodeBlockWriter } from "ts-morph";

export function addDateTimeUpdateHandler(writer: CodeBlockWriter, models: readonly Model[]) {
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

  writer
    .writeLine(`export function handleDateTimeUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(`)
    .writeLine(`  record: R,`)
    .writeLine(`  fieldName: keyof R,`)
    .writeLine(`  dateTimeUpdate: ${updateOperationType},`)
    .writeLine(`): void`)
    .block(() => {
      writer
        .writeLine(`if (dateTimeUpdate === undefined) return;`)
        .write(`if (typeof dateTimeUpdate === "string" || dateTimeUpdate instanceof Date`)
        .conditionalWrite(nullableDateTimeFieldPresent, ` || dateTimeUpdate === null`)
        .writeLine(`)`)
        .block(() => {
          writer
            .writeLine(`(record[fieldName] as ${fieldType}) = `)
            .conditionalWrite(nullableDateTimeFieldPresent, () => `dateTimeUpdate === null ? null : `)
            .write(`new Date(dateTimeUpdate);`);
        });
      writer.writeLine(`else if (dateTimeUpdate.set !== undefined)`).block(() => {
        writer
          .writeLine(`(record[fieldName] as ${fieldType}) = `)
          .conditionalWrite(nullableDateTimeFieldPresent, () => `dateTimeUpdate.set === null ? null : `)
          .write(`new Date(dateTimeUpdate.set);`);
      });
    });
}
