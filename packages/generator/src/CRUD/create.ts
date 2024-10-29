import { Model } from "src/types";
import { getModelFieldData, toCamelCase } from "../utils";
import { ClassDeclaration } from "ts-morph";

// TODO: also should return the created object
// TODO: nested creates, connects, and createMany

export function addCreateMethod(modelClass: ClassDeclaration, model: Model) {
  const { allRequiredFieldsHaveDefaults, fieldsWithDefaultValue } = getModelFieldData(model);

  modelClass.addMethod({
    name: "create",
    isAsync: true,
    parameters: [
      {
        name: allRequiredFieldsHaveDefaults ? `query?` : `query`,
        type: `Prisma.${model.name}CreateArgs`,
      },
    ],
    statements: (writer) => {
      const queryKeyword = allRequiredFieldsHaveDefaults ? "query?" : "query";
      if (fieldsWithDefaultValue.length > 0) {
        writer
          .write(`await this.client.db.add("${toCamelCase(model.name)}",`)
          .write(`await this.fillDefaults(${queryKeyword}.data));`)
          .newLine();
      } else {
        writer.writeLine(`await this.client.db.add("${toCamelCase(model.name)}", ${queryKeyword}.data);`);
      }
      writer.writeLine(`this.emit("create")`);
    },
  });
}
