import type { Model } from "src/fileCreators/types";
import type CodeBlockWriter from "code-block-writer";

export function addBytesFilter(writer: CodeBlockWriter, models: readonly Model[]) {
  const bytesFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "Bytes");
  if (bytesFields.length === 0) return;

  const nonNullableBytesFieldPresent = bytesFields.some(({ isRequired }) => isRequired);
  const nullableBytesFieldPresent = bytesFields.some(({ isRequired }) => !isRequired);

  let filterType = "undefined | Uint8Array";
  if (nonNullableBytesFieldPresent) {
    filterType += " | Prisma.BytesFilter<unknown>";
  }
  if (nullableBytesFieldPresent) {
    filterType += " | null | Prisma.BytesNullableFilter<unknown>";
  }

  writer.writeLine(`export function whereBytesFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(record: R, fieldName: keyof R, bytesFilter: ${filterType}): boolean`).block(() => {
    writer
      .writeLine(`if (bytesFilter === undefined) return true;`)
      .blankLine()
      .writeLine(`function areUint8ArraysEqual(arr1: Uint8Array, arr2: Uint8Array)`)
      .block(() => {
        writer
          .writeLine(`if (arr1.length !== arr2.length) return false;`)
          .writeLine(`for (let i = 0; i < arr1.length; i++) if (arr1[i] !== arr2[i]) return false;`)
          .writeLine(`return true;`);
      })
      .blankLine()
      .writeLine(`const value = record[fieldName] as Uint8Array | null;`)
      .writeLine(`if (bytesFilter === null) return value === null;`)
      .blankLine()
      .writeLine(`if (bytesFilter instanceof Uint8Array)`)
      .block(() => {
        writer
          .writeLine(`if (value === null) return false;`)
          .writeLine(`if (!areUint8ArraysEqual(bytesFilter, value)) return false;`);
      })
      .writeLine(`else`)
      .block(() => {
        addEqualsHandler(writer);
        addNotHandler(writer);
        addInHandler(writer);
        addNotInHandler(writer);
      })
      .writeLine(`return true;`);
  });
}

function addEqualsHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (bytesFilter.equals === null)`)
    .block(() => {
      writer.writeLine(`if (value !== null) return false;`);
    })
    .writeLine(`if (Buffer.isBuffer(bytesFilter.equals))`)
    .block(() => {
      writer
        .writeLine(`if (value === null) return false;`)
        .writeLine(`if (!bytesFilter.equals.equals(value)) return false;`);
    });
}

function addNotHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (bytesFilter.not === null)`)
    .block(() => {
      writer.writeLine(`if (value === null) return false;`);
    })
    .writeLine(`if (Buffer.isBuffer(bytesFilter.not))`)
    .block(() => {
      writer
        .writeLine(`if (value === null) return false;`)
        .writeLine(`if (bytesFilter.not.equals(value)) return false;`);
    });
}

function addInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(bytesFilter.in))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (!bytesFilter.in.some((buffer) => areUint8ArraysEqual(buffer, value))) return false;`);
  });
}

function addNotInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(bytesFilter.notIn))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (bytesFilter.notIn.some((buffer) => areUint8ArraysEqual(buffer, value))) return false;`);
  });
}
