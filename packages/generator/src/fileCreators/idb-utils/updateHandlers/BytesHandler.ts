import { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

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
    .writeLine(
      `export function handleBytesUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, bytesUpdate: ${updateOperationType}): void`,
    )
    .block(() => {
      writer
        .writeLine(`if (bytesUpdate === undefined) return;`)
        .writeLine(
          `if (bytesUpdate instanceof Uint8Array${nullableBytesFieldPresent ? ` || bytesUpdate === null` : ""})`,
        )
        .block(() => {
          writer.writeLine(`(record[fieldName] as ${fieldType}) = bytesUpdate;`);
        });
      writer.writeLine(`else if (bytesUpdate.set !== undefined)`).block(() => {
        writer.writeLine(`(record[fieldName] as ${fieldType}) = bytesUpdate.set;`);
      });
    });
}
