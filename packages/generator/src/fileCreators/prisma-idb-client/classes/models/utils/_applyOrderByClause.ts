import type { Model } from "src/fileCreators/types";
import CodeBlockWriter from "code-block-writer";

export function addApplyOrderByClause(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async _applyOrderByClause<`)
    .writeLine(`O extends Prisma.Args<Prisma.${model.name}Delegate, 'findMany'>['orderBy'],`)
    .writeLine(`R extends Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>`)
    .writeLine(`>(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void>`)
    .block(() => {
      addEarlyExitAndArrayDeclaration(writer);
      addKeyedRecordsCreation(writer);
      addKeyedRecordsSorter(writer);
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
