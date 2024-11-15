import { Model } from "src/fileCreators/types";
import { toCamelCase } from "../../../../../helpers/utils";
import { ClassDeclaration, CodeBlockWriter } from "ts-morph";

export function addGetNeededStoresForCreate(modelClass: ClassDeclaration, model: Model) {
  modelClass.addMethod({
    name: "_getNeededStoresForCreate",
    typeParameters: [{ name: "D", constraint: `Partial<Prisma.Args<Prisma.${model.name}Delegate, "create">['data']>` }],
    parameters: [{ name: "data", type: "D" }],
    returnType: "Set<StoreNames<PrismaIDBSchema>>",
    statements: (writer) => {
      writer.writeLine("const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();");
      processRelationsInData(writer, model);
      writer.writeLine("return neededStores;");
    },
  });
}

function processRelationsInData(writer: CodeBlockWriter, model: Model) {
  const relationFields = model.fields.filter(({ kind }) => kind === "object");
  relationFields.forEach((field) => {
    console.log(field);
    writer.writeLine(`if (data.${field.name})`).block(() => {
      writer.writeLine(`neededStores.add('${field.type}')`);
      writer.writeLine(`if (data.${field.name}.create)`).block(() => {
        writer
          .writeLine(`convertToArray(data.${field.name}.create).forEach((record) => `)
          .write(`this.client.${toCamelCase(field.type)}._getNeededStoresForCreate(record)`)
          .write(`.forEach((storeName) => neededStores.add(storeName))`)
          .writeLine(`);`);
      });
      writer.writeLine(`if (data.${field.name}.connectOrCreate)`).block(() => {
        writer
          .writeLine(`convertToArray(data.${field.name}.connectOrCreate).forEach((record) => `)
          .write(`this.client.${toCamelCase(field.type)}._getNeededStoresForCreate(record.create)`)
          .write(`.forEach((storeName) => neededStores.add(storeName))`)
          .writeLine(`);`);
      });
      if (!field.isList) return;
      writer.writeLine(`if (data.${field.name}.createMany)`).block(() => {
        writer
          .writeLine(`convertToArray(data.${field.name}.createMany.data).forEach((record) => `)
          .write(`this.client.${toCamelCase(field.type)}._getNeededStoresForCreate(record)`)
          .write(`.forEach((storeName) => neededStores.add(storeName))`)
          .writeLine(`);`);
      });
    });
  });
}
