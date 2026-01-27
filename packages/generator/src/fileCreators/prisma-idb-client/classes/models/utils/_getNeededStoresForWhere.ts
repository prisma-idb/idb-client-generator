import { Model } from "src/fileCreators/types";
import CodeBlockWriter from "code-block-writer";
import { toCamelCase } from "../../../../../helpers/utils";

export function addGetNeededStoresForWhere(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`_getNeededStoresForWhere<W extends Prisma.Args<Prisma.${model.name}Delegate, "findMany">["where"]>(`)
    .writeLine(`whereClause: W,`)
    .writeLine(`neededStores: Set<StoreNames<PrismaIDBSchema>>,`)
    .writeLine(`)`)
    .block(() => {
      writer.writeLine(`if (whereClause === undefined) return;`);
      handleLogicalParams(writer);
      handleRelations(writer, model);
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
            `this.client.${toCamelCase(field.type)}._getNeededStoresForWhere(whereClause.${field.name}.every, neededStores)`
          )
          .writeLine(
            `this.client.${toCamelCase(field.type)}._getNeededStoresForWhere(whereClause.${field.name}.some, neededStores)`
          )
          .writeLine(
            `this.client.${toCamelCase(field.type)}._getNeededStoresForWhere(whereClause.${field.name}.none, neededStores)`
          );
      } else {
        writer.writeLine(
          `this.client.${toCamelCase(field.type)}._getNeededStoresForWhere(whereClause.${field.name}, neededStores)`
        );
      }
    });
  });
}
