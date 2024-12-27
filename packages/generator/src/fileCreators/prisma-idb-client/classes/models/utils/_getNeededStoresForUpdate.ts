import { Model } from "src/fileCreators/types";
import { toCamelCase } from "../../../../../helpers/utils";
import { ClassDeclaration } from "ts-morph";

export function addGetNeededStoresForUpdate(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "_getNeededStoresForUpdate",
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "update">` }],
    parameters: [{ name: "query", type: "Partial<Q>" }],
    returnType: `Set<StoreNames<PrismaIDBSchema>>`,
    statements: (writer) => {
      const relationFields = model.fields.filter(({ kind }) => kind === "object");
      writer.writeLine(
        `const neededStores = this._getNeededStoresForFind(query).union(this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.${model.name}Delegate, "create">["data"]));`,
      );
      for (const field of relationFields) {
        if (field.isRequired && !field.isList) continue;

        let condition = `query.data?.${field.name}?.delete`;
        if (field.isList) condition += ` || query.data?.${field.name}?.deleteMany`;

        writer.writeLine(`if (${condition})`).block(() => {
          writer.writeLine(`this.client.${toCamelCase(field.type)}._getNeededStoresForNestedDelete(neededStores);`);
        });
      }
      writer.writeLine(`return neededStores;`);
    },
  });
}
