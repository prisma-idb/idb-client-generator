import { ClassDeclaration } from "ts-morph";

export function addFindFirstMethod(modelClass: ClassDeclaration) {
  modelClass.addMethod({
    name: "findFirst",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<T, "findFirst">` }],
    parameters: [{ name: "query?", type: "Q" }],
    returnType: `Promise<Prisma.Result<T, Q, "findFirst"> | null>`,
    statements: (writer) => {
      writer.writeLine(
        'return ((await this.findMany(query))[0] as Prisma.Result<T, Q, "findFirst"> | undefined) ?? null;',
      );
    },
  });
}
