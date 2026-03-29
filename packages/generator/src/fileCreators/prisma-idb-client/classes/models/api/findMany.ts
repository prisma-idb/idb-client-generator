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
      applyDistinctClauseToRecords(writer);
      applyPaginationClause(writer, model);
      applyRelationsToRecords(writer, model);
      applySelectClauseToRecords(writer);
      returnRecords(writer, model);
    });
}

function getRecords(writer: CodeBlockWriter) {
  writer
    .writeLine(`tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");`)
    .writeLine(
      `let records = await this._applyWhereClause(await this._getRecords(tx, query?.where), query?.where, tx);`
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
    .writeLine("const selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);");
  writer.writeLine(`this._preprocessListFields(selectAppliedRecords);`);
}

function applyDistinctClauseToRecords(writer: CodeBlockWriter) {
  writer.writeLine("if (query?.distinct)").block(() => {
    writer
      .writeLine(`const distinctFields = IDBUtils.convertToArray(query.distinct);`)
      .writeLine(`const seen = new Set<string>();`)
      .writeLine(`records = records.filter((record) => `)
      .block(() => {
        writer
          .writeLine(`const key = JSON.stringify(distinctFields.map((field) => record[field]));`)
          .writeLine(`if (seen.has(key)) return false;`)
          .writeLine(`seen.add(key);`)
          .writeLine(`return true;`);
      })
      .writeLine(");");
  });
}

function applyPaginationClause(writer: CodeBlockWriter, model: Model) {
  const uniqueIdentifiers = getUniqueIdentifiers(model);

  writer.write("if (query?.skip !== undefined && query.skip < 0)").block(() => {
    writer.writeLine("throw new Error('skip must be a non-negative integer');");
  });

  if (uniqueIdentifiers.length > 0) {
    writer.write("if (query?.cursor)").block(() => {
      writer.writeLine("let cursorIndex = -1;");
      uniqueIdentifiers.forEach((uid, index) => {
        const fields: string[] = JSON.parse(uid.keyPath);
        const fieldTypes: string[] = uid.keyPathTypes;
        const condition = `(query.cursor as Record<string, unknown>)[${JSON.stringify(uid.name)}] !== undefined`;
        const prefix = index === 0 ? "if" : "else if";
        writer.write(`${prefix} (${condition}) `).block(() => {
          if (fields.length > 1) {
            writer.writeLine(
              `const normalizedCursor = (query.cursor as Record<string, unknown>)[${JSON.stringify(uid.name)}] as Record<string, unknown>;`
            );
          } else {
            writer.writeLine(`const normalizedCursor = query.cursor as Record<string, unknown>;`);
          }
          const comparisonExpr = fields
            .map((f, i) => {
              if (fieldTypes[i] === "Date") {
                return `new Date(record.${f} as string | number | Date).getTime() === new Date(normalizedCursor.${f} as string | number | Date).getTime()`;
              }
              return `record.${f} === normalizedCursor.${f}`;
            })
            .join(" && ");
          writer.writeLine(`cursorIndex = records.findIndex((record) => ${comparisonExpr});`);
        });
      });
      writer.write("if (cursorIndex === -1)").block(() => {
        writer.writeLine("records = [];");
      });
      writer.write("else if (query.take !== undefined && query.take < 0)").block(() => {
        writer.writeLine("const skip = query.skip ?? 0;");
        writer.writeLine("const end = cursorIndex + 1 - skip;");
        writer.writeLine("const start = end + query.take;");
        writer.writeLine("records = records.slice(Math.max(0, start), Math.max(0, end));");
      });
      writer.write("else").block(() => {
        writer.writeLine("records = records.slice(cursorIndex);");
      });
    });
  }

  writer.write("if (!(query?.cursor && query?.take !== undefined && query.take < 0))").block(() => {
    writer.write("if (query?.skip !== undefined)").block(() => {
      writer.writeLine("records = records.slice(query.skip);");
    });
    writer.write("if (query?.take !== undefined)").block(() => {
      writer.write("if (query.take < 0)").block(() => {
        writer.writeLine("records = records.slice(query.take);");
      });
      writer.write("else").block(() => {
        writer.writeLine("records = records.slice(0, query.take);");
      });
    });
  });
}

function returnRecords(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(`return selectAppliedRecords as Prisma.Result<Prisma.${model.name}Delegate, Q, 'findMany'>;`);
}
