import { ClassDeclaration } from "ts-morph";

export function addCreateManyMethod(modelClass: ClassDeclaration) {
  modelClass.addMethod({
    name: "createMany",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: 'Prisma.Args<T, "createMany">' }],
    parameters: [{ name: "query", type: `Q` }],
    returnType: 'Promise<Prisma.Result<T, Q, "createMany">>',
    statements: (writer) => {
      writer
        .writeLine('const tx = this.client.db.transaction(this.model.name, "readwrite");')
        .writeLine("const queryData = Array.isArray(query.data) ? query.data : [query.data];")
        .writeLine(
          "await Promise.all([...queryData.map(async (record) => tx.store.add(await this.fillDefaults(record))), tx.done]);",
        )
        .writeLine('this.emit("create");')
        .writeLine('return { count: queryData.length } as Prisma.Result<T, Q, "createMany">;');
    },
  });
}
