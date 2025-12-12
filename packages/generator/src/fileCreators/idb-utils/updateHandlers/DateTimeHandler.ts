import { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

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

  writer.writeLine(`export function handleDateTimeUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, dateTimeUpdate: ${updateOperationType}): void`).block(() => {
    writer
      .writeLine(`if (dateTimeUpdate === undefined) return;`)
      .writeLine(`if (typeof dateTimeUpdate === "string" || dateTimeUpdate instanceof Date${nullableDateTimeFieldPresent ? ` || dateTimeUpdate === null` : ""})`)
      .block(() => {
        if (nullableDateTimeFieldPresent) {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = dateTimeUpdate === null ? null : new Date(dateTimeUpdate);`);
        } else {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = new Date(dateTimeUpdate);`);
        }
      });
    writer.writeLine(`else if (dateTimeUpdate.set !== undefined)`).block(() => {
      if (nullableDateTimeFieldPresent) {
        writer.writeLine(`(record[fieldName] as ${fieldType}) = dateTimeUpdate.set === null ? null : new Date(dateTimeUpdate.set);`);
      } else {
        writer.writeLine(`(record[fieldName] as ${fieldType}) = new Date(dateTimeUpdate.set);`);
      }
    });
  });
}
