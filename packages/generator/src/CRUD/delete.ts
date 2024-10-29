import { Model } from "src/types";
import { toCamelCase } from "../utils";
import { ClassDeclaration } from "ts-morph";

// TODO: handle cascades
// TODO: use indexes wherever possible

export function addDeleteMethod(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "delete",
    isAsync: true,
    parameters: [{ name: "query", type: `Prisma.${model.name}DeleteArgs` }],
    statements: (writer) => {
      writer
        .writeLine(`const records = filterByWhereClause(`)
        .indent(() => {
          writer
            .writeLine(`await this.client.db.getAll("${toCamelCase(model.name)}"),`)
            .writeLine(`this.keyPath,`)
            .writeLine(`query.where,`);
        })
        .writeLine(`)`)
        .writeLine(`if (records.length === 0) return;`)
        .blankLine()
        .writeLine(`await this.client.db.delete(`)
        .indent(() => {
          writer
            .writeLine(`"${toCamelCase(model.name)}",`)
            .writeLine(`this.keyPath.map((keyField) => records[0][keyField] as IDBValidKey),`);
        })
        .writeLine(`);`)
        .writeLine(`this.emit("delete")`);
    },
  });
}
