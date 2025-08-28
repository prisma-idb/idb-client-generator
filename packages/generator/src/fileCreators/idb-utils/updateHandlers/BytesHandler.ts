import { Model } from "src/fileCreators/types";
import type { CodeBlockWriter } from "ts-morph";

export function addBytesUpdateHandler(writer: CodeBlockWriter, models: readonly Model[]) {
  const bytesFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "Bytes");
  if (bytesFields.length === 0) return;

  let updateOperationType = "undefined | Uint8Array";
  let fieldType = "Uint8Array";

  const nonNullableBytesFieldPresent = bytesFields.some(({ isRequired }) => isRequired);
  const nullableBytesFieldPresent = bytesFields.some(({ isRequired }) => !isRequired);

  if (nonNullableBytesFieldPresent) {
    updateOperationType += " | Prisma.BytesFieldUpdateOperationsInput";
  }
  if (nullableBytesFieldPresent) {
    updateOperationType += " | null | Prisma.NullableBytesFieldUpdateOperationsInput";
    fieldType += " | null";
  }

  writer
    .writeLine(`export function handleBytesUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(`)
    .writeLine(`  record: R,`)
    .writeLine(`  fieldName: keyof R,`)
    .writeLine(`  bytesUpdate: ${updateOperationType},`)
    .writeLine(`): void`)
    .block(() => {
      writer
        .writeLine(`if (bytesUpdate === undefined) return;`)
        .write(`if (bytesUpdate instanceof Uint8Array`)
        .conditionalWrite(nullableBytesFieldPresent, ` || bytesUpdate === null`)
        .writeLine(`)`)
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = bytesUpdate;`);
        });
      writer.writeLine(`else if (bytesUpdate.set !== undefined)`).block(() => {
        writer.writeLine(`(record[fieldName] as ${fieldType}) = bytesUpdate.set;`);
      });
    });
}
