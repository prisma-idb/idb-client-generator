import { Model } from "src/types";
import { getModelFieldData, toCamelCase } from "../utils";
import { ClassDeclaration } from "ts-morph";

export function addCreateManyMethod(modelClass: ClassDeclaration, model: Model) {
  const { fieldsWithDefaultValue } = getModelFieldData(model);

  modelClass.addMethod({
    name: "createMany",
    isAsync: true,
    parameters: [{ name: "query", type: `Prisma.${model.name}CreateManyArgs` }],
    statements: (writer) => {
      writer
        .writeLine(`const tx = this.client.db.transaction('${toCamelCase(model.name)}', 'readwrite')`)
        .writeLine(`const queryData = Array.isArray(query.data) ? query.data : [query.data];`)
        .writeLine(`await Promise.all([`)
        .indent(() => {
          if (fieldsWithDefaultValue.length > 0) {
            writer.writeLine(`...queryData.map(async (record) => tx.store.add(await this.fillDefaults(record))),`);
          } else {
            writer.writeLine(`...queryData.map((record) => tx.store.add(record)),`);
          }
          writer.writeLine("tx.done");
        })
        .writeLine("])")
        .writeLine(`this.emit("create")`);
    },
  });
}
