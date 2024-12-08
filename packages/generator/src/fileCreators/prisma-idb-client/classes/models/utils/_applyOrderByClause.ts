import type { Model } from "src/fileCreators/types";
import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

export function addApplyOrderByClause(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "_applyOrderByClause",
    isAsync: true,
    typeParameters: [
      { name: "O", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'findMany'>['orderBy']` },
      { name: "R", constraint: `Prisma.Result<Prisma.${model.name}Delegate, object, "findFirstOrThrow">` },
    ],
    parameters: [
      { name: "records", type: `R[]` },
      { name: "orderByClause", type: "O" },
      { name: "tx", type: "IDBUtils.TransactionType" },
    ],
    returnType: `Promise<void>`,
    statements: (writer) => {
      addEarlyExitAndArrayDeclaration(writer);
      addKeyedRecordsCreation(writer);
      addKeyedRecordsSorter(writer);
    },
  });
}

function addEarlyExitAndArrayDeclaration(writer: CodeBlockWriter) {
  writer
    .writeLine(`if (orderByClause === undefined) return;`)
    .writeLine(`const orderByClauses = IDBUtils.convertToArray(orderByClause);`);
}

function addKeyedRecordsCreation(writer: CodeBlockWriter) {
  writer
    .writeLine(`const indexedKeys = await Promise.all(`)
    .writeLine(`records.map(async (record) => `)
    .block(() => {
      writer
        .writeLine(`const keys = await Promise.all(`)
        .writeLine(`orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),`)
        .writeLine(`);`)
        .writeLine(`return { keys, record };`);
    })
    .writeLine(`));`);
}

function addKeyedRecordsSorter(writer: CodeBlockWriter) {
  writer
    .writeLine(`indexedKeys.sort((a, b) => `)
    .block(() => {
      writer
        .writeLine(`for (let i = 0; i < orderByClauses.length; i++)`)
        .block(() => {
          writer
            .writeLine(`const clause = orderByClauses[i];`)
            .writeLine(
              `const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));`,
            )
            .writeLine(`if (comparison !== 0) return comparison;`);
        })
        .writeLine(`return 0;`);
    })
    .writeLine(`);`);

  writer.writeLine(`for (let i = 0; i < records.length; i++)`).block(() => {
    writer.writeLine(`records[i] = indexedKeys[i].record;`);
  });
}
