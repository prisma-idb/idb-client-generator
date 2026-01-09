import { Model } from "src/fileCreators/types";
import CodeBlockWriter from "code-block-writer";
import { getUniqueIdentifiers, toCamelCase } from "../../../../../helpers/utils";

export function addGetNeededStoresForUpdate(
  writer: CodeBlockWriter,
  model: Model,
  models: readonly Model[],
  outboxModelName: string = "OutboxEvent",
) {
  writer
    .writeLine(`_getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.${model.name}Delegate, "update">>(`)
    .writeLine(`query: Partial<Q>,`)
    .writeLine(`): Set<StoreNames<PrismaIDBSchema>>`)
    .block(() => {
      writer.writeLine(
        `const neededStores = this._getNeededStoresForFind(query).union(this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.${model.name}Delegate, "create">["data"]));`,
      );
      addNestedQueryStores(writer, model);
      addNestedDeleteStores(writer, model);
      addUpdateCascadingStores(writer, model, models);
      writer
        .writeLine(`if (this.client.shouldTrackModel(this.modelName)) {`)
        .writeLine(`neededStores.add("${outboxModelName}" as StoreNames<PrismaIDBSchema>);`)
        .writeLine(`}`);
      writer.writeLine(`return neededStores;`);
    });
}

function addNestedQueryStores(writer: CodeBlockWriter, model: Model) {
  const relationFields = model.fields.filter(({ kind }) => kind === "object");
  for (const field of relationFields) {
    writer.writeLine(`if (query.data?.${field.name}?.connect)`).block(() => {
      writer
        .writeLine(`neededStores.add("${field.type}");`)
        .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.connect).forEach((connect) => `)
        .block(() => {
          writer.writeLine(`this.client.${toCamelCase(field.type)}._getNeededStoresForWhere(connect, neededStores);`);
        })
        .writeLine(`);`);
    });
    if (!field.isRequired) {
      writer.writeLine(`if (query.data?.${field.name}?.disconnect)`).block(() => {
        writer
          .writeLine(`neededStores.add("${field.type}");`)
          .writeLine(`if (query.data?.${field.name}?.disconnect !== true)`)
          .block(() => {
            writer
              .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.disconnect).forEach((disconnect) => `)
              .block(() => {
                writer.writeLine(
                  `this.client.${toCamelCase(field.type)}._getNeededStoresForWhere(disconnect, neededStores);`,
                );
              })
              .writeLine(`)`);
          });
      });
    }
    if (field.isList) {
      writer
        .writeLine(`if (query.data?.${field.name}?.set)`)
        .block(() => {
          writer
            .writeLine(`neededStores.add("${field.type}");`)
            .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.set).forEach((setWhere) => `)
            .block(() => {
              writer.writeLine(
                `this.client.${toCamelCase(field.type)}._getNeededStoresForWhere(setWhere, neededStores);`,
              );
            })
            .writeLine(`)`);
        })
        .writeLine(`if (query.data?.${field.name}?.updateMany)`)
        .block(() => {
          writer
            .writeLine(`neededStores.add("${field.type}");`)
            .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.updateMany).forEach((update) => `)
            .block(() => {
              writer.writeLine(
                `this.client.${toCamelCase(field.type)}._getNeededStoresForUpdate(update as Prisma.Args<Prisma.${field.type}Delegate, "update">).forEach((store) => neededStores.add(store));`,
              );
            })
            .writeLine(`)`);
        });
    }
    writer
      .writeLine(`if (query.data?.${field.name}?.update)`)
      .block(() => {
        writer
          .writeLine(`neededStores.add("${field.type}");`)
          .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.update).forEach((update) => `)
          .block(() => {
            writer.writeLine(
              `this.client.${toCamelCase(field.type)}._getNeededStoresForUpdate(update as Prisma.Args<Prisma.${field.type}Delegate, "update">).forEach((store) => neededStores.add(store));`,
            );
          })
          .writeLine(`)`);
      })
      .writeLine(`if (query.data?.${field.name}?.upsert)`)
      .block(() => {
        writer
          .writeLine(`neededStores.add("${field.type}");`)
          .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.upsert).forEach((upsert) => `)
          .block(() => {
            writer
              .writeLine(
                `const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<Prisma.${field.type}Delegate, "update">;`,
              )
              .writeLine(
                `this.client.${toCamelCase(field.type)}._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));`,
              );
          })
          .writeLine(`)`);
      });
  }
}

function addNestedDeleteStores(writer: CodeBlockWriter, model: Model) {
  const relationFields = model.fields.filter(({ kind }) => kind === "object");
  for (const field of relationFields) {
    if (field.isRequired && !field.isList) continue;

    let condition = `query.data?.${field.name}?.delete`;
    if (field.isList) condition += ` || query.data?.${field.name}?.deleteMany`;

    writer.writeLine(`if (${condition})`).block(() => {
      writer.writeLine(`this.client.${toCamelCase(field.type)}._getNeededStoresForNestedDelete(neededStores);`);
    });
  }
}

function addUpdateCascadingStores(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const dependentModels = models.filter((m) =>
    m.fields.some((f) => f.kind === "object" && f.type === model.name && f.relationFromFields?.length),
  );
  if (!dependentModels.length) return;

  const pkFields = JSON.parse(getUniqueIdentifiers(model)[0].keyPath) as string[];
  let condition = `query.data?.${pkFields[0]} !== undefined`;
  for (let i = 1; i < pkFields.length; i++) {
    condition += ` || query.data?.${pkFields[i]} !== undefined`;
  }
  writer.writeLine(`if (${condition})`).block(() => {
    for (const dependentModel of dependentModels) {
      writer.writeLine(`neededStores.add("${dependentModel.name}");`);
    }
  });
}
