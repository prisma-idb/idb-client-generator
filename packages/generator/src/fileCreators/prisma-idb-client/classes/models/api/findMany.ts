import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getOptionsParameterRead } from "../helpers/methodOptions";

/**
 * Writes a `findMany` async method for the specified model into the provided code writer.
 *
 * The generated method is a generic Prisma-style `findMany` delegate that accepts an optional
 * query and an `options` object (used to pass a `tx` transaction), then loads records, applies
 * relations, applies `select` and `distinct` clauses, preprocesses list fields, and returns the result.
 *
 * @param writer - CodeBlockWriter used to emit the method source
 * @param model - Model descriptor for which the `findMany` method will be generated
 */
export function addFindManyMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async findMany<Q extends Prisma.Args<Prisma.${model.name}Delegate, "findMany">>(`)
    .writeLine(`query?: Q,`)
    .write(getOptionsParameterRead())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "findMany">>`)
    .block(() => {
      writer.writeLine(`const { tx: txOption } = options ?? {};`).writeLine(`let tx = txOption;`);
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