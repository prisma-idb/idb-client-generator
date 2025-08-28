import type { CodeBlockWriter } from "ts-morph";

export function addApplyLogicalFilters(writer: CodeBlockWriter) {
  writer
    .writeLine(
      `export async function applyLogicalFilters<T, R extends Prisma.Result<T, object, "findFirstOrThrow">, W extends Prisma.Args<T, "findFirstOrThrow">["where"]>(`,
    )
    .writeLine(`records: R[],`)
    .writeLine(`whereClause: W,`)
    .writeLine(`tx: TransactionType,`)
    .writeLine(`keyPath: string[],`)
    .writeLine(`applyWhereFunction: (records: R[], clause: W, tx: TransactionType) => Promise<R[]>`)
    .writeLine(`): Promise<R[]>`)
    .block(() => {
      handleAndParameter(writer);
      handleOrParameter(writer);
      handleNotParameter(writer);
      writer.writeLine(`return records;`);
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
