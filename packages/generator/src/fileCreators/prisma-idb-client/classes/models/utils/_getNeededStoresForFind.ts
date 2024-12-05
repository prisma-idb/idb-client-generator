import { Model } from "src/fileCreators/types";
import { toCamelCase } from "../../../../../helpers/utils";
import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

export function addGetNeededStoresForFind(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "_getNeededStoresForFind",
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "findMany">` }],
    parameters: [{ name: "query", hasQuestionToken: true, type: "Q" }],
    returnType: "Set<StoreNames<PrismaIDBSchema>>",
    statements: (writer) => {
      writer
        .writeLine(`const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();`)
        .writeLine(`neededStores.add("${model.name}");`);
      processRelationsInQuery(writer, model);
      writer.writeLine("return neededStores;");
    },
  });
}

function processRelationsInQuery(writer: CodeBlockWriter, model: Model) {
  const relationFields = model.fields.filter(({ kind }) => kind === "object");
  relationFields.forEach((field) => {
    writer.writeLine(`if (query?.select?.${field.name} || query?.include?.${field.name})`).block(() => {
      writer
        .writeLine(`neededStores.add("${field.type}");`)
        .writeLine(`if (typeof query.select?.${field.name} === "object")`)
        .block(() => {
          writer.writeLine(
            `this.client.${toCamelCase(field.type)}._getNeededStoresForFind(query.select.${field.name}).forEach((storeName) => neededStores.add(storeName));`,
          );
        })
        .writeLine(`if (typeof query.include?.${field.name} === "object")`)
        .block(() => {
          writer.writeLine(
            `this.client.${toCamelCase(field.type)}._getNeededStoresForFind(query.include.${field.name}).forEach((storeName) => neededStores.add(storeName));`,
          );
        });
    });
  });
}
