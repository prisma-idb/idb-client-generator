import { Model } from "src/fileCreators/types";
import { ClassDeclaration } from "ts-morph";
import { toCamelCase } from "../../../../../helpers/utils";

export function addGetNeededStoresForNestedDelete(
  modelClass: ClassDeclaration,
  model: Model,
  models: readonly Model[],
) {
  modelClass.addMethod({
    name: "_getNeededStoresForNestedDelete",
    parameters: [{ name: "neededStores", type: "Set<StoreNames<PrismaIDBSchema>>" }],
    returnType: `void`,
    statements: (writer) => {
      writer.writeLine(`neededStores.add("${model.name}");`);
      const relationFields = model.fields.filter(({ kind }) => kind === "object");
      const cascadingDeletes = relationFields.filter((field) => {
        const otherModel = models.find((m) => m.name === field.type);
        return otherModel?.fields.some((f) => f.type === model.name && f.relationFromFields?.length);
      });
      for (const field of cascadingDeletes) {
        writer.writeLine(`this.client.${toCamelCase(field.type)}._getNeededStoresForNestedDelete(neededStores);`);
      }
    },
  });
}
