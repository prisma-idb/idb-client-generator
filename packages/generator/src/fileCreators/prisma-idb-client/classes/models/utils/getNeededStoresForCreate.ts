import { Model } from "src/fileCreators/types";
import { toCamelCase } from "../../../../../helpers/utils";
import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

export function addGetNeededStoresForCreate(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "_getNeededStoresForCreate",
    typeParameters: [{ name: "D", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "create">['data']` }],
    parameters: [{ name: "data", type: "D" }],
    returnType: "Set<StoreNames<PrismaIDBSchema>>",
    statements: (writer) => {
      writer.writeLine("const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();");
      addRelationMap(writer, model);
      processRelationsInData(writer);
      writer.writeLine("return neededStores;");
    },
  });
}

function addRelationMap(writer: CodeBlockWriter, model: Model) {
  const relationFields = model.fields.filter(({ kind }) => kind === "object");
  writer.writeLine("const relationMap = new Map([");
  relationFields.forEach((field) => {
    writer.writeLine(`['${field.name}', ['${field.type}', this.client.${toCamelCase(field.type)}]],`);
  });
  writer.writeLine("] as const)");
}

function processRelationsInData(writer: CodeBlockWriter) {
  writer.writeLine(`for (const key of relationMap.keys())`).block(() => {
    writer.writeLine(`if (data[key])`).block(() => {
      writer.writeLine(`neededStores.add(relationMap.get(key)![0])`);
      writer.writeLine(`if (data[key].create)`).block(() => {
        writer
          .writeLine(`convertToArray(data[key].create).forEach((record) => `)
          .writeLine(
            `relationMap.get(key)![1]._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName))`,
          )
          .writeLine(`);`);
      });
      writer.writeLine(`if (data[key].connectOrCreate)`).block(() => {
        writer
          .writeLine(`convertToArray(data[key].connectOrCreate).forEach((record) => `)
          .writeLine(
            `relationMap.get(key)![1]._getNeededStoresForCreate(record.create).forEach((storeName) => neededStores.add(storeName))`,
          )
          .writeLine(`);`);
      });
      writer.writeLine(`if ('createMany' in data[key])`).block(() => {
        writer
          .writeLine(`convertToArray(data[key].createMany).forEach((record) => `)
          .writeLine(
            `relationMap.get(key)![1]._getNeededStoresForCreate(record as never).forEach((storeName) => neededStores.add(storeName))`,
          )
          .writeLine(`);`);
      });
    });
  });
}
