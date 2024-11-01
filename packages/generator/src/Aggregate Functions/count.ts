import { ClassDeclaration } from "ts-morph";

export function addCountMethod(modelClass: ClassDeclaration) {
  modelClass.addMethod({
    name: "count",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: "Prisma.Args<T, 'count'>" }],
    parameters: [{ name: "query", type: `Q` }],
    statements: (writer) => {
      writer
        .writeLine(`const records = filterByWhereClause(`)
        .indent(() => {
          writer
            .writeLine(`await this.client.db.getAll(toCamelCase(this.model.name)),`)
            .writeLine(`this.keyPath,`)
            .writeLine(`query?.where,`);
        }) // filter by where clause
        .writeLine(`)`)
        .writeLine('return records.length as Prisma.Result<T, Q, "count">;'); // return the respective filtered record length
    },
  });
}
