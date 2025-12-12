import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";

export function addFindManyMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async findMany<Q extends Prisma.Args<Prisma.${model.name}Delegate, "findMany">>(`)
    .writeLine(`query?: Q,`)
    .writeLine(`tx?: IDBUtils.TransactionType,`)
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "findMany">>`)
    .block(() => {
      getRecords(writer, model);
      applyRelationsToRecords(writer, model);
      applySelectClauseToRecords(writer);
      applyDistinctClauseToRecords(writer);
      returnRecords(writer, model);
    });
}

function getRecords(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");`)
    .writeLine(
      `const records = await this._applyWhereClause(await tx.objectStore("${model.name}").getAll(), query?.where, tx);`,
    )
    .writeLine(`await this._applyOrderByClause(records, query?.orderBy, tx);`);
}

function applyRelationsToRecords(writer: CodeBlockWriter, model: Model) {
  writer
    .write(`const relationAppliedRecords = (await this._applyRelations(records, tx, query)) `)
    .write(`as Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>[];`);
}

function applySelectClauseToRecords(writer: CodeBlockWriter) {
  writer
    .writeLine("const selectClause = query?.select;")
    .writeLine("let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);");
}

function applyDistinctClauseToRecords(writer: CodeBlockWriter) {
  writer.writeLine("if (query?.distinct)").block(() => {
    writer
      .writeLine(`const distinctFields = IDBUtils.convertToArray(query.distinct);`)
      .writeLine(`const seen = new Set<string>();`)
      .writeLine(`selectAppliedRecords = selectAppliedRecords.filter((record) => `)
      .block(() => {
        writer
          .writeLine(`const key = distinctFields.map((field) => record[field]).join("|");`)
          .writeLine(`if (seen.has(key)) return false;`)
          .writeLine(`seen.add(key);`)
          .writeLine(`return true;`);
      })
      .writeLine(");");
  });
}

function returnRecords(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`this._preprocessListFields(selectAppliedRecords);`)
    .writeLine(`return selectAppliedRecords as Prisma.Result<Prisma.${model.name}Delegate, Q, 'findMany'>;`);
}
