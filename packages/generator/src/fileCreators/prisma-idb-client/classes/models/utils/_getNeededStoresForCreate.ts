import { Model } from "src/fileCreators/types";
import CodeBlockWriter from "code-block-writer";
import { toCamelCase } from "../../../../../helpers/utils";

export function addGetNeededStoresForCreate(
  writer: CodeBlockWriter,
  model: Model,
  outboxModelName: string = "OutboxEvent",
) {
  writer
    .writeLine(
      `_getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.${model.name}Delegate, "create">["data"]>>(`,
    )
    .writeLine(`data: D,`)
    .writeLine(`): Set<StoreNames<PrismaIDBSchema>>`)
    .block(() => {
      writer
        .writeLine(`const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();`)
        .writeLine(`neededStores.add("${model.name}");`);
      processRelationsInData(writer, model);
      writer
        .writeLine(`if (this.client.shouldTrackModel(this.modelName)) {`)
        .writeLine(`neededStores.add("${outboxModelName}" as StoreNames<PrismaIDBSchema>);`)
        .writeLine(`}`);
      writer.writeLine("return neededStores;");
    });
}

function processRelationsInData(writer: CodeBlockWriter, model: Model) {
  const relationFields = model.fields.filter(({ kind }) => kind === "object");
  relationFields.forEach((field) => {
    writer.writeLine(`if (data?.${field.name})`).block(() => {
      writer.writeLine(`neededStores.add('${field.type}')`);
      writer.writeLine(`if (data.${field.name}.create)`).block(() => {
        writer
          .writeLine(
            `const createData = Array.isArray(data.${field.name}.create) ? data.${field.name}.create : [data.${field.name}.create];`,
          )
          .writeLine(`createData.forEach((record) => `)
          .write(`this.client.${toCamelCase(field.type)}._getNeededStoresForCreate(record)`)
          .write(`.forEach((storeName) => neededStores.add(storeName))`)
          .writeLine(`);`);
      });
      writer.writeLine(`if (data.${field.name}.connectOrCreate)`).block(() => {
        writer
          .writeLine(`IDBUtils.convertToArray(data.${field.name}.connectOrCreate).forEach((record) => `)
          .write(`this.client.${toCamelCase(field.type)}._getNeededStoresForCreate(record.create)`)
          .write(`.forEach((storeName) => neededStores.add(storeName))`)
          .writeLine(`);`);
      });
      if (field.isList) {
        writer.writeLine(`if (data.${field.name}.createMany)`).block(() => {
          writer
            .writeLine(`IDBUtils.convertToArray(data.${field.name}.createMany.data).forEach((record) => `)
            .write(`this.client.${toCamelCase(field.type)}._getNeededStoresForCreate(record)`)
            .write(`.forEach((storeName) => neededStores.add(storeName))`)
            .writeLine(`);`);
        });
      }
    });
    const fkField = model.fields.find((fkField) => fkField.name === field.relationFromFields?.at(0));
    if (fkField) {
      writer.writeLine(`if (data?.${fkField.name} !== undefined)`).block(() => {
        writer.writeLine(`neededStores.add("${field.type}")`);
      });
    }
  });
}
