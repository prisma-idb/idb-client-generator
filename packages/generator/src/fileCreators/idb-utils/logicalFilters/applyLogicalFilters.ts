import type { CodeBlockWriter, SourceFile } from "ts-morph";

export function addApplyLogicalFilters(utilsFile: SourceFile) {
  utilsFile.addFunction({
    name: "applyLogicalFilters",
    isExported: true,
    isAsync: true,
    typeParameters: [
      { name: "T" },
      { name: "R", constraint: `Prisma.Result<T, object, "findFirstOrThrow">` },
      { name: "W", constraint: `Prisma.Args<T, "findFirstOrThrow">["where"]` },
    ],
    parameters: [
      { name: "records", type: "R[]" },
      { name: "whereClause", type: "W" },
      { name: "tx", type: "TransactionType" },
      { name: "keyPath", type: "string[]" },
      { name: "applyWhereFunction", type: `(records: R[], clause: W, tx: TransactionType) => Promise<R[]>` },
    ],
    returnType: "Promise<R[]>",
    statements: (writer) => {
      handleAndParameter(writer);
      handleOrParameter(writer);
      handleNotParameter(writer);
      writer.writeLine(`return records;`);
    },
  });
}

function handleAndParameter(writer: CodeBlockWriter) {
  writer.writeLine(`if (whereClause.AND)`).block(() => {
    writer
      .writeLine(`records = intersectArraysByNestedKey(`)
      .writeLine(`await Promise.all(`)
      .writeLine(
        `convertToArray(whereClause.AND).map(async (clause) => await applyWhereFunction(records, clause, tx)),`,
      )
      .writeLine(`), keyPath`)
      .writeLine(");");
  });
}

function handleOrParameter(writer: CodeBlockWriter) {
  writer.writeLine(`if (whereClause.OR)`).block(() => {
    writer
      .writeLine(`records = removeDuplicatesByKeyPath(`)
      .writeLine(`await Promise.all(`)
      .writeLine(`convertToArray(whereClause.OR).map(async (clause) => await applyWhereFunction(records, clause, tx)),`)
      .writeLine(`), keyPath`)
      .writeLine(");");
  });
}

function handleNotParameter(writer: CodeBlockWriter) {
  writer.writeLine(`if (whereClause.NOT)`).block(() => {
    writer
      .writeLine(`const excludedRecords = removeDuplicatesByKeyPath(`)
      .writeLine(
        `await Promise.all(convertToArray(whereClause.NOT).map(async (clause) => applyWhereFunction(records, clause, tx))), keyPath`,
      )
      .writeLine(`);`);

    writer
      .writeLine(`records = records.filter(`)
      .writeLine(
        `(item) => !excludedRecords.some((excluded) => keyPath.every((key) => excluded[key as keyof R] === item[key as keyof R])),`,
      )
      .writeLine(`);`);
  });
}
