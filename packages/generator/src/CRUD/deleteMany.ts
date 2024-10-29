import { Model } from "src/types";
import { toCamelCase } from "src/utils";
import { ClassDeclaration } from "ts-morph";

// TODO: handle cascades
// TODO: use indexes wherever possible

export function addDeleteManyMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "deleteMany",
    isAsync: true,
    parameters: [{ name: "query?", type: `Prisma.${model.name}DeleteManyArgs` }],
    statements: (writer) => {
      writer
        .writeLine(`const records = filterByWhereClause(`)
        .indent(() => {
          writer
            .writeLine(`await this.client.db.getAll("${toCamelCase(model.name)}"),`)
            .writeLine(`this.keyPath,`)
            .writeLine(`query?.where,`);
        })
        .writeLine(`)`)
        .writeLine(`if (records.length === 0) return;`)
        .blankLine()
        .writeLine(`const tx = this.client.db.transaction("${toCamelCase(model.name)}", "readwrite");`)
        .writeLine(`await Promise.all([`)
        .indent(() => {
          writer
            .writeLine(`...records.map((record) => `)
            .indent(() => {
              writer.writeLine(`tx.store.delete(this.keyPath.map((keyField) => record[keyField] as IDBValidKey))`);
            })
            .writeLine(`),`)
            .writeLine(`tx.done,`);
        })
        .writeLine(`]);`)
        .writeLine(`this.emit("delete")`);
    },
  });
}
