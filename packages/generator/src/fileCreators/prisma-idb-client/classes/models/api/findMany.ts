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
      applyDistinctClauseToRecords(writer);
      applyPaginationClause(writer, model);
      applySelectClauseToRecords(writer);
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
    .write(`let relationAppliedRecords = (await this._applyRelations(records, tx, query)) `)
    .write(`as Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>[];`);
}

function applySelectClauseToRecords(writer: CodeBlockWriter) {
  writer
    .writeLine("const selectClause = query?.select;")
    .writeLine("let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);");
  writer.writeLine(`this._preprocessListFields(selectAppliedRecords);`);
}

function applyDistinctClauseToRecords(writer: CodeBlockWriter) {
  writer.writeLine("if (query?.distinct)").block(() => {
    writer
      .writeLine(`const distinctFields = IDBUtils.convertToArray(query.distinct);`)
      .writeLine(`const seen = new Set<string>();`)
      .writeLine(`relationAppliedRecords = relationAppliedRecords.filter((record) => `)
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

  writer.write("if (query?.skip !== undefined && query.skip < 0)").block(() => {
    writer.writeLine("throw new Error('skip must be a non-negative integer');");
  });

  if (pk) {
    const pkFields: string[] = JSON.parse(pk.keyPath);
    const pkFieldTypes: string[] = pk.keyPathTypes;
    writer.write("if (query?.cursor)").block(() => {
      if (pkFields.length > 1) {
        writer.writeLine(
          `const normalizedCursor = (query.cursor as Record<string, unknown>).${pk.name} as Record<string, unknown>;`
        );
      } else {
        writer.writeLine(`const normalizedCursor = query.cursor as Record<string, unknown>;`);
      }
      const comparisonExpr = pkFields
        .map((f, i) => {
          if (pkFieldTypes[i] === "Date") {
            return `new Date(record.${f} as string | number | Date).getTime() === new Date(normalizedCursor.${f} as string | number | Date).getTime()`;
          }
          return `record.${f} === normalizedCursor.${f}`;
        })
        .join(" && ");
      writer.writeLine(`const cursorIndex = relationAppliedRecords.findIndex((record) => ${comparisonExpr});`);
      writer.write("if (cursorIndex === -1)").block(() => {
        writer.writeLine("relationAppliedRecords = [];");
      });
      writer.write("else if (query.take !== undefined && query.take < 0)").block(() => {
        writer.writeLine("const skip = query.skip ?? 0;");
        writer.writeLine("const end = cursorIndex + 1 - skip;");
        writer.writeLine("const start = end + query.take;");
        writer.writeLine(
          "relationAppliedRecords = relationAppliedRecords.slice(Math.max(0, start), Math.max(0, end));"
        );
      });
      writer.write("else").block(() => {
        writer.writeLine("relationAppliedRecords = relationAppliedRecords.slice(cursorIndex);");
      });
    });
  }

  writer.write("if (!(query?.cursor && query?.take !== undefined && query.take < 0))").block(() => {
    writer.write("if (query?.skip !== undefined)").block(() => {
      writer.writeLine("relationAppliedRecords = relationAppliedRecords.slice(query.skip);");
    });
    writer.write("if (query?.take !== undefined)").block(() => {
      writer.write("if (query.take < 0)").block(() => {
        writer.writeLine("relationAppliedRecords = relationAppliedRecords.slice(query.take);");
      });
      writer.write("else").block(() => {
        writer.writeLine("relationAppliedRecords = relationAppliedRecords.slice(0, query.take);");
      });
    });
  });
}

function returnRecords(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`return selectAppliedRecords as Prisma.Result<Prisma.${model.name}Delegate, Q, 'findMany'>;`);
}
