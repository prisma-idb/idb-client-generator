import { ClassDeclaration } from "ts-morph";

// TODO: nested creates, connects, and createMany

export function addCreateMethod(modelClass: ClassDeclaration) {
  modelClass.addMethod({
    name: "create",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: 'Prisma.Args<T, "create">' }],
    returnType: 'Promise<Prisma.Result<T, Q, "create">>',
    parameters: [{ name: "query", type: "Q" }],
    statements: (writer) => {
      writer
        .writeLine("const record = await this.fillDefaults<Q>(query.data);")
        .writeLine("await this.client.db.add(this.model.name, record);")
        .writeLine(`this.emit("create");`)
        .writeLine(`return record as Prisma.Result<T, Q, "create">;`);
    },
  });
}
