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
      writer.writeLine(`if (!whereStringFilter(record, field, whereClause[field])) return false;`);
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
      writer.writeLine(`if (!whereNumberFilter(record, field, whereClause[field])) return false;`);
    });
}
