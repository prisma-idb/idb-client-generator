import type { Model } from "src/fileCreators/types";
import { ClassDeclaration, CodeBlockWriter, Scope } from "ts-morph";

export function addApplyWhereClause(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "_applyWhereClause",
    isAsync: true,
    scope: Scope.Private,
    typeParameters: [
      { name: "W", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'findFirstOrThrow'>['where']` },
      { name: "R", constraint: `Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>` },
    ],
    parameters: [
      { name: "records", type: `R[]` },
      { name: "whereClause", type: "W" },
    ],
    returnType: `Promise<R[]>`,
    statements: (writer) => {
      writer.writeLine(`if (!whereClause) return records;`);
      writer
        .writeLine(`return records.filter((record) => `)
        .block(() => {
          addStringFiltering(writer, model);
          addNumberFiltering(writer, model);
          addBigIntFiltering(writer, model);
          addBoolFiltering(writer, model);
          addBytesFiltering(writer, model);
          addDateTimeFiltering(writer, model);
          writer.writeLine(`return true;`);
        })
        .writeLine(`);`);
    },
  });
}

function addStringFiltering(writer: CodeBlockWriter, model: Model) {
  const stringFields = model.fields.filter((field) => field.type === "String").map(({ name }) => name);
  if (stringFields.length === 0) return;
  writer
    .writeLine(`const stringFields = ${JSON.stringify(stringFields)} as const;`)
    .writeLine(`for (const field of stringFields)`)
    .block(() => {
      writer.writeLine(`if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return false;`);
    });
}

function addNumberFiltering(writer: CodeBlockWriter, model: Model) {
  const numberFields = model.fields
    .filter((field) => field.type === "Int" || field.type === "Float")
    .map(({ name }) => name);

  if (numberFields.length === 0) return;
  writer
    .writeLine(`const numberFields = ${JSON.stringify(numberFields)} as const;`)
    .writeLine(`for (const field of numberFields)`)
    .block(() => {
      writer.writeLine(`if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return false;`);
    });
}

function addBigIntFiltering(writer: CodeBlockWriter, model: Model) {
  const numberFields = model.fields.filter((field) => field.type === "BigInt").map(({ name }) => name);

  if (numberFields.length === 0) return;
  writer
    .writeLine(`const bigIntFields = ${JSON.stringify(numberFields)} as const;`)
    .writeLine(`for (const field of bigIntFields)`)
    .block(() => {
      writer.writeLine(`if (!IDBUtils.whereBigIntFilter(record, field, whereClause[field])) return false;`);
    });
}

function addBoolFiltering(writer: CodeBlockWriter, model: Model) {
  const booleanFields = model.fields.filter((field) => field.type === "Boolean").map(({ name }) => name);

  if (booleanFields.length === 0) return;
  writer
    .writeLine(`const booleanFields = ${JSON.stringify(booleanFields)} as const;`)
    .writeLine(`for (const field of booleanFields)`)
    .block(() => {
      writer.writeLine(`if (!IDBUtils.whereBoolFilter(record, field, whereClause[field])) return false;`);
    });
}

function addBytesFiltering(writer: CodeBlockWriter, model: Model) {
  const bytesFields = model.fields.filter((field) => field.type === "Bytes").map(({ name }) => name);

  if (bytesFields.length === 0) return;
  writer
    .writeLine(`const bytesFields = ${JSON.stringify(bytesFields)} as const;`)
    .writeLine(`for (const field of bytesFields)`)
    .block(() => {
      writer.writeLine(`if (!IDBUtils.whereBytesFilter(record, field, whereClause[field])) return false;`);
    });
}

function addDateTimeFiltering(writer: CodeBlockWriter, model: Model) {
  const dateTimeFields = model.fields.filter((field) => field.type === "DateTime").map(({ name }) => name);

  if (dateTimeFields.length === 0) return;
  writer
    .writeLine(`const dateTimeFields = ${JSON.stringify(dateTimeFields)} as const;`)
    .writeLine(`for (const field of dateTimeFields)`)
    .block(() => {
      writer.writeLine(`if (!IDBUtils.whereDateTimeFilter(record, field, whereClause[field])) return false;`);
    });
}
