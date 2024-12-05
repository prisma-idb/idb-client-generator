import { Model } from "src/fileCreators/types";
import { toCamelCase } from "../../../../../helpers/utils";
import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

export function addGetNeededStoresForWhere(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "_getNeededStoresForWhere",
    typeParameters: [{ name: "W", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "findMany">['where']` }],
    parameters: [
      { name: "whereClause", type: "W" },
      { name: "neededStores", type: "Set<StoreNames<PrismaIDBSchema>>" },
    ],
    statements: (writer) => {
      writer.writeLine(`if (whereClause === undefined) return;`);
      handleLogicalParams(writer);
      handleRelations(writer, model);
    },
  });
}

function handleLogicalParams(writer: CodeBlockWriter) {
  writer.writeLine(`for (const param of IDBUtils.LogicalParams)`).block(() => {
    writer.writeLine(`if (whereClause[param])`).block(() => {
      writer.writeLine(`for (const clause of IDBUtils.convertToArray(whereClause[param]))`).block(() => {
        writer.writeLine(`this._getNeededStoresForWhere(clause, neededStores);`);
      });
    });
  });
}

function handleRelations(writer: CodeBlockWriter, model: Model) {
  const relationFields = model.fields.filter(({ kind }) => kind === "object");
  relationFields.forEach((field) => {
    writer.writeLine(`if (whereClause.${field.name})`).block(() => {
      writer.writeLine(`neededStores.add("${field.type}");`);
      if (field.isList) {
        writer
          .writeLine(
            `this.client.${toCamelCase(field.type)}._getNeededStoresForWhere(whereClause.${field.name}.every, neededStores)`,
          )
          .writeLine(
            `this.client.${toCamelCase(field.type)}._getNeededStoresForWhere(whereClause.${field.name}.some, neededStores)`,
          )
          .writeLine(
            `this.client.${toCamelCase(field.type)}._getNeededStoresForWhere(whereClause.${field.name}.none, neededStores)`,
          );
      } else {
        writer.writeLine(
          `this.client.${toCamelCase(field.type)}._getNeededStoresForWhere(whereClause.${field.name}, neededStores)`,
        );
      }
    });
  });
}
