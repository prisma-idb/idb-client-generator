import { CodeBlockWriter, SourceFile } from "ts-morph";

export function addGenericComparator(utilsFile: SourceFile) {
  utilsFile.addFunction({
    name: "genericComparator",
    isExported: true,
    parameters: [
      { name: "a", type: "unknown" },
      { name: "b", type: "unknown" },
      {
        name: "sortOrder",
        type: `Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" }`,
        initializer: `"asc"`,
      },
    ],
    returnType: "number",
    statements: (writer) => {
      handleNullsSorting(writer);
      handleMultiplierAndReturnValueInit(writer);

      handleStringComparison(writer);
      handleNumberComparison(writer);
      // TODO: rest

      handleComparisonTypeErrorAndReturn(writer);
    },
  });
}

function handleNullsSorting(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof sortOrder !== "string" && sortOrder.nulls)`).block(() => {
    writer
      .writeLine(`const nullMultiplier = sortOrder.nulls === "first" ? -1 : 1;`)
      .blankLine()
      .writeLine(`if (a === null && b === null) return 0;`)
      .writeLine(`if (a === null || b === null) return (a === null ? 1 : -1) * nullMultiplier;`);
  });
}

function handleMultiplierAndReturnValueInit(writer: CodeBlockWriter) {
  writer
    .writeLine(
      `const multiplier = typeof sortOrder === "string" ? (sortOrder === "asc" ? 1 : -1) : sortOrder.sort === "asc" ? 1 : -1;`,
    )
    .writeLine(`let returnValue: number | undefined;`)
    .blankLine();
}

function handleStringComparison(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof a === "string" && typeof b === "string")`).block(() => {
    writer.writeLine(`returnValue = a.localeCompare(b);`);
  });
}

function handleNumberComparison(writer: CodeBlockWriter) {
  writer.writeLine(`if (typeof a === "number" && typeof b === "number")`).block(() => {
    writer.writeLine(`returnValue = a - b;`);
  });
}

function handleComparisonTypeErrorAndReturn(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (returnValue === undefined)`)
    .block(() => {
      writer.writeLine("throw new Error(`Comparison of type: ${typeof a} not yet supported`);");
    })
    .writeLine(`return returnValue * multiplier;`);
}
