import type { CodeBlockWriter, SourceFile } from "ts-morph";

export function addIntFilter(utilsFile: SourceFile) {
  utilsFile.addFunction({
    name: "whereIntFilter",
    isExported: true,
    typeParameters: [{ name: "T" }, { name: "R", constraint: `Prisma.Result<T, object, "findFirstOrThrow">` }],
    parameters: [
      { name: "record", type: `R` },
      { name: "fieldName", type: "keyof R" },
      {
        name: "intFilter",
        type: "Prisma.NestedIntNullableFilter<unknown> | number | undefined | null",
      },
    ],
    returnType: "boolean",
    statements: (writer) => {
      writer
        .writeLine(`if (intFilter === undefined) return true;`)
        .blankLine()
        .writeLine(`const value = record[fieldName] as number | null;`)
        .writeLine(`if (intFilter === null) return value === null;`)
        .blankLine()
        .writeLine(`if (typeof intFilter === 'number')`)
        .block(() => {
          writer.writeLine(`if (value !== intFilter) return false;`);
        })
        .writeLine(`else`)
        .block(() => {
          addEqualsHandler(writer);
          addNotHandler(writer);
          addInHandler(writer);
          addNotInHandler(writer);
          addLtHandler(writer);
          addLteHandler(writer);
          addGtHandler(writer);
          addGteHandler(writer);
        })
        .writeLine(`return true;`);
    },
  });
}

function addEqualsHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (intFilter.equals === null)`)
    .block(() => {
      writer.writeLine(`if (value !== null) return false;`);
    })
    .writeLine(`if (typeof intFilter.equals === "number")`)
    .block(() => {
      writer.writeLine(`if (intFilter.equals !== value) return false;`);
    });
}

function addNotHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (intFilter.not === null)`)
    .block(() => {
      writer.writeLine(`if (value === null) return false;`);
    })
    .writeLine(`if (typeof intFilter.not === "number")`)
    .block(() => {
      writer.writeLine(`if (intFilter.not === value) return false;`);
    });
}

function addInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(intFilter.in) && value !== null)`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!intFilter.in.includes(value)) return false;`);
  });
}

function addNotInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(intFilter.notIn))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (intFilter.notIn.includes(value)) return false;`);
  });
}

function addLtHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof intFilter.lt === "number")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value < intFilter.lt)) return false;`);
  });
}

function addLteHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof intFilter.lte === "number")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value <= intFilter.lte)) return false;`);
  });
}

function addGtHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof intFilter.gt === "number")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value > intFilter.gt)) return false;`);
  });
}

function addGteHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof intFilter.gte === "number")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value >= intFilter.gte)) return false;`);
  });
}
