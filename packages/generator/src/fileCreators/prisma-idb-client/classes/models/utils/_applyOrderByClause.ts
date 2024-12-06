import type { Model } from "src/fileCreators/types";
import { ClassDeclaration, CodeBlockWriter, Scope } from "ts-morph";

export function addApplyOrderByClause(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "_applyOrderByClause",
    isAsync: true,
    scope: Scope.Private,
    typeParameters: [
      { name: "O", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'findMany'>['orderBy']` },
      { name: "R", constraint: `Prisma.Result<Prisma.${model.name}Delegate, object, "findFirstOrThrow">` },
    ],
    parameters: [
      { name: "records", type: `R[]` },
      { name: "orderByClause", type: "O" },
    ],
    returnType: `Promise<void>`,
    statements: (writer) => {
      addEarlyExitAndFieldDeclaration(writer, model);
      addOrderByHandling(writer, model);
    },
  });
}

function addEarlyExitAndFieldDeclaration(writer: CodeBlockWriter, model: Model) {
  const scalarFields = model.fields.filter(({ kind }) => kind !== "object").map(({ name }) => name);
  writer
    .writeLine(`if (orderByClause === undefined) return;`)
    .writeLine(`const scalarFields = ${JSON.stringify(scalarFields)} as const;`);
}

function addOrderByHandling(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`records.sort((a, b) => `)
    .block(() => {
      writer
        .writeLine(`for (const clause of IDBUtils.convertToArray(orderByClause))`)
        .block(() => {
          writer
            .writeLine(`const untypedClauseField = Object.keys(clause)[0] as keyof R;`)
            .writeLine(`if (scalarFields.includes(untypedClauseField as (typeof scalarFields)[number]))`)
            .block(() => {
              writer
                .writeLine(`const clauseField = untypedClauseField as (typeof scalarFields)[number];`)
                .writeLine(
                  `const comparison = IDBUtils.genericComparator(a[clauseField], b[clauseField], clause[clauseField]);`,
                )
                .writeLine(`if (comparison !== 0) return comparison;`);
            });
        })
        .writeLine(`return 0;`);
    })
    .writeLine(`);`);
}
