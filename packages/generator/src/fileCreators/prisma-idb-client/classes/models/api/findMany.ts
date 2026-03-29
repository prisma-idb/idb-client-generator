import CodeBlockWriter from "code-block-writer";
import { Model } from "../../../../../fileCreators/types";
import { getUniqueIdentifiers } from "../../../../../helpers/utils";
import { getOptionsParameterRead, getOptionsSetupRead } from "../helpers/methodOptions";

export function addFindManyMethod(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`async findMany<Q extends Prisma.Args<Prisma.${model.name}Delegate, "findMany">>(`)
    .writeLine(`query?: Q,`)
    .write(getOptionsParameterRead())
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "findMany">>`)
    .block(() => {
      writer.write(getOptionsSetupRead());
      getRecords(writer);
      applyRelationsToRecords(writer, model);
      applySelectClauseToRecords(writer);
      applyDistinctClauseToRecords(writer);
      applyPaginationClause(writer, model);
      returnRecords(writer, model);
    });
}

function getRecords(writer: CodeBlockWriter) {
  writer
    .writeLine(`tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");`)
    .writeLine(
      `const records = await this._applyWhereClause(await this._getRecords(tx, query?.where), query?.where, tx);`
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

function applyPaginationClause(writer: CodeBlockWriter, model: Model) {
  const pk = getUniqueIdentifiers(model)[0];

  if (pk) {
    const pkFields: string[] = JSON.parse(pk.keyPath);
    writer.write("if (query?.cursor)").block(() => {
      writer.writeLine(
        `const cursorValues = ${pk.keyPath}.map((field) => (query.cursor as Record<string, unknown>)[field]);`
      );
      writer.writeLine(
        `const cursorIndex = relationAppliedRecords.findIndex((record) => ${pkFields
          .map((f, i) => `record.${f} === cursorValues[${i}]`)
          .join(" && ")});`
      );
      writer.write("if (cursorIndex === -1)").block(() => {
        writer.writeLine("selectAppliedRecords = [];");
      });
      writer.write("else").block(() => {
        writer.writeLine("selectAppliedRecords = selectAppliedRecords.slice(cursorIndex);");
      });
    });
  }

  writer.write("if (query?.skip)").block(() => {
    writer.writeLine("selectAppliedRecords = selectAppliedRecords.slice(query.skip);");
  });

  writer.write("if (query?.take !== undefined)").block(() => {
    writer.write("if (query.take < 0)").block(() => {
      writer.writeLine("selectAppliedRecords = selectAppliedRecords.slice(query.take);");
    });
    writer.write("else").block(() => {
      writer.writeLine("selectAppliedRecords = selectAppliedRecords.slice(0, query.take);");
    });
  });
}

function returnRecords(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`this._preprocessListFields(selectAppliedRecords);`)
    .writeLine(`return selectAppliedRecords as Prisma.Result<Prisma.${model.name}Delegate, Q, 'findMany'>;`);
}
