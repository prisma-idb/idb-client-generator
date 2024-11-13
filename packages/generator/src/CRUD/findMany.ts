import { ClassDeclaration } from "ts-morph";

// TODO: orderBy, indexes, nested select, include, where

export function addFindManyMethod(modelClass: ClassDeclaration) {
  modelClass.addMethod({
    name: "findMany",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<T, "findMany">` }],
    parameters: [{ name: "query?", type: "Q" }],
    returnType: `Promise<Prisma.Result<T, Q, "findMany">>`,
    statements: (writer) => {
      writer
        .writeLine(
          'const records = (await this.client.db.getAll(this.model.name)) as Prisma.Result<T, Q, "findFirstOrThrow">[];',
        )
        .writeLine(`return filterByWhereClause<T, Q>(`)
        .indent(() => {
          writer.writeLine(`records, this.keyPath, query?.where`);
        })
        .writeLine(`) as Prisma.Result<T, Q, "findMany">;`);
    },
  });
}
