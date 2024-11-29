import type { Model } from "src/fileCreators/types";
import type { CodeBlockWriter, SourceFile } from "ts-morph";

export function addBytesFilter(utilsFile: SourceFile, models: readonly Model[]) {
  const bytesFields = models.flatMap(({ fields }) => fields).filter((field) => field.type === "Bytes");
  if (bytesFields.length === 0) return;

  const nullableBytesFieldPresent = bytesFields.some(({ isRequired }) => !isRequired);
  let filterType = "undefined | Buffer | Prisma.BytesFilter<unknown>";
  if (nullableBytesFieldPresent) {
    filterType += " | null | Prisma.BytesNullableFilter<unknown>";
  }

  utilsFile.addFunction({
    name: "whereBytesFilter",
    isExported: true,
    typeParameters: [{ name: "T" }, { name: "R", constraint: `Prisma.Result<T, object, "findFirstOrThrow">` }],
    parameters: [
      { name: "record", type: `R` },
      { name: "fieldName", type: "keyof R" },
      {
        name: "bytesFilter",
        type: filterType,
      },
    ],
    returnType: "boolean",
    statements: (writer) => {
      writer
        .writeLine(`if (bytesFilter === undefined) return true;`)
        .blankLine()
        .writeLine(`const value = record[fieldName] as Buffer | null;`)
        .writeLine(`if (bytesFilter === null) return value === null;`)
        .blankLine()
        .writeLine(`if (Buffer.isBuffer(bytesFilter))`)
        .block(() => {
          writer
            .writeLine(`if (value === null) return false;`)
            .writeLine(`if (!bytesFilter.equals(value)) return false;`);
        })
        .writeLine(`else`)
        .block(() => {
          addEqualsHandler(writer);
          addNotHandler(writer);
          addInHandler(writer);
          addNotInHandler(writer);
        })
        .writeLine(`return true;`);
    },
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
      .writeLine(`if (!bytesFilter.in.some((buffer) => buffer.equals(value))) return false;`);
  });
}

function addNotInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(bytesFilter.notIn))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (bytesFilter.notIn.some((buffer) => buffer.equals(value))) return false;`);
  });
}
