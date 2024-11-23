import type { CodeBlockWriter, SourceFile } from "ts-morph";

export function addNumberFilter(utilsFile: SourceFile) {
  utilsFile.addFunction({
    name: "whereNumberFilter",
    isExported: true,
    typeParameters: [{ name: "T" }, { name: "R", constraint: `Prisma.Result<T, object, "findFirstOrThrow">` }],
    parameters: [
      { name: "record", type: `R` },
      { name: "fieldName", type: "keyof R" },
      {
        name: "numberFilter",
        type: "Prisma.IntFilter<unknown> | Prisma.FloatFilter<unknown> | number | undefined | null",
      },
    ],
    returnType: "boolean",
    statements: (writer) => {
      writer
        .writeLine(`if (numberFilter === undefined) return true;`)
        .blankLine()
        .writeLine(`const value = record[fieldName] as number | null;`)
        .writeLine(`if (numberFilter === null) return value === null;`)
        .blankLine()
        .writeLine(`if (typeof numberFilter === 'number')`)
        .block(() => {
          writer.writeLine(`if (value !== numberFilter) return false;`);
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
    .writeLine(`if (numberFilter.equals === null)`)
    .block(() => {
      writer.writeLine(`if (value !== null) return false;`);
    })
    .writeLine(`if (typeof numberFilter.equals === "number")`)
    .block(() => {
      writer.writeLine(`if (numberFilter.equals !== value) return false;`);
    });
}

function addNotHandler(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (numberFilter.not === null)`)
    .block(() => {
      writer.writeLine(`if (value === null) return false;`);
    })
    .writeLine(`if (typeof numberFilter.not === "number")`)
    .block(() => {
      writer.writeLine(`if (numberFilter.not === value) return false;`);
    });
}

function addInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(numberFilter.in) && value !== null)`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (!numberFilter.in.includes(value)) return false;`);
  });
}

function addNotInHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (Array.isArray(numberFilter.notIn))`).block(() => {
    writer
      .writeLine(`if (value === null) return false;`)
      .writeLine(`if (numberFilter.notIn.includes(value)) return false;`);
  });
}

function addLtHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof numberFilter.lt === "number")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value < numberFilter.lt)) return false;`);
  });
}

function addLteHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof numberFilter.lte === "number")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value <= numberFilter.lte)) return false;`);
  });
}

function addGtHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof numberFilter.gt === "number")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value > numberFilter.gt)) return false;`);
  });
}

function addGteHandler(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof numberFilter.gte === "number")`).block(() => {
    writer.writeLine(`if (value === null) return false;`).writeLine(`if (!(value >= numberFilter.gte)) return false;`);
  });
}
