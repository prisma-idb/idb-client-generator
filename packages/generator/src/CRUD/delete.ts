import { ClassDeclaration } from "ts-morph";

// TODO: handle cascades
// TODO: use indexes wherever possible

export function addDeleteMethod(modelClass: ClassDeclaration) {
  modelClass.addMethod({
    name: "delete",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: 'Prisma.Args<T, "delete">' }],
    parameters: [{ name: "query", type: `Q` }],
    returnType: 'Promise<Prisma.Result<T, Q, "delete">>',
    statements: (writer) => {
      writer
        .writeLine(`const records = filterByWhereClause(`)
        .indent(() => {
          writer
            .writeLine(`await this.client.db.getAll(toCamelCase(this.model.name)),`)
            .writeLine(`this.keyPath,`)
            .writeLine(`query.where,`);
        })
        .writeLine(`)`)
        .writeLine(`if (records.length === 0) throw new Error("Record not found");`)
        .blankLine()
        .writeLine(`await this.client.db.delete(`)
        .indent(() => {
          writer
            .writeLine(`toCamelCase(this.model.name),`)
            .writeLine(`this.keyPath.map((keyField) => records[0][keyField] as IDBValidKey),`);
        })
        .writeLine(`);`)
        .writeLine(`this.emit("delete");`)
        .writeLine(`return records[0] as Prisma.Result<T, Q, "delete">;`);
    },
  });
}
