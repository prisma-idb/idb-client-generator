import CodeBlockWriter from "code-block-writer";
import { Field, Model } from "../../../../../fileCreators/types";
import { getModelFieldData, getUniqueIdentifiers, toCamelCase } from "../../../../../helpers/utils";

export function addCreateMethod(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  writer
    .writeLine(`async create<Q extends Prisma.Args<Prisma.${model.name}Delegate, "create">>(`)
    .writeLine(`query: Q,`)
    .writeLine(`tx?: IDBUtils.ReadwriteTransactionType,`)
    .writeLine(`silent?: boolean`)
    .writeLine(`): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "create">>`)
    .block(() => {
      createTx(writer);
      createUndefinedReplacer(writer, model);
      createDependencies(writer, model, models);
      createCurrentModel(writer, model);
      createDependents(writer, model, models);
      applyClausesAndReturnRecords(writer, model);
    });
}

function createTx(writer: CodeBlockWriter) {
  writer
    .writeLine(`const storesNeeded = this._getNeededStoresForCreate(query.data);`)
    .writeLine(`tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");`);
}

function createUndefinedReplacer(writer: CodeBlockWriter, model: Model) {
  const { allRequiredFieldsHaveDefaults } = getModelFieldData(model);
  if (!allRequiredFieldsHaveDefaults) return;

  writer.writeLine(`query.data = query.data === undefined ? {} : query.data;`);
}

function createDependencies(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const fields = model.fields.filter((field) => field.relationName && field.relationFromFields?.length !== 0);

  fields.sort((a, b) => {
    const modelA = models.find(({ name }) => a.type === name)!;
    if (modelA.fields.find((field) => field.isRequired && field.type === b.type && !field.isList)) return 1;

    const modelB = models.find(({ name }) => b.type === name)!;
    if (modelB.fields.find((field) => field.isRequired && field.type === a.type && !field.isList)) return -1;

    return 0;
  });

  fields.forEach((field) => {
    const foreignKeyField = model.fields.find((fkField) => fkField.name === field.relationFromFields?.at(0))!;

    writer.writeLine(`if (query.data.${field.name})`).block(() => {
      addOneToOneMetaOnFieldRelation(writer, field, models);
    });
    handleForeignKeyValidation(writer, field, foreignKeyField, models);
  });
}

function createCurrentModel(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));`)
    .writeLine(`const keyPath = await tx.objectStore("${model.name}").add(record);`);
}

function createDependents(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const allFields = models.flatMap((model) => model.fields);
  const fields = model.fields.filter((field) => field.relationName && !field.relationFromFields?.length);

  fields.sort((a, b) => {
    const modelA = models.find(({ name }) => a.type === name)!;
    if (modelA.fields.find((field) => field.isRequired && field.type === b.type && !field.isList)) return 1;

    const modelB = models.find(({ name }) => b.type === name)!;
    if (modelB.fields.find((field) => field.isRequired && field.type === a.type && !field.isList)) return -1;

    return 0;
  });

  fields.forEach((field) => {
    if (!field.relationName) return;
    if (field.relationFromFields?.length || field.relationToFields?.length) return;
    const otherField = allFields.find(
      (otherField) => otherField !== field && otherField.relationName === field.relationName,
    )!;

    if (!field.isList) {
      addOneToOneMetaOnOtherFieldRelation(writer, field, otherField, model);
    } else {
      const dependentModel = models.find(({ name }) => name === field.type)!;
      const fks = dependentModel.fields.filter(
        (field) =>
          dependentModel.fields.find((fkField) => fkField.name === field.relationFromFields?.at(0)) !== undefined,
      );
      addOneToManyRelation(writer, field, otherField, fks, model);
    }
  });
}

function applyClausesAndReturnRecords(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`const data = (await tx.objectStore("${model.name}").get(keyPath))!;`)
    .write(`const recordsWithRelations = this._applySelectClause`)
    .write(`(await this._applyRelations<object>([data], tx, query), query.select)[0];`)
    .writeLine(`this._preprocessListFields([recordsWithRelations]);`)
    .writeLine(`await this.emit("create", keyPath, undefined, data, silent);`)
    .writeLine(`return recordsWithRelations as Prisma.Result<Prisma.${model.name}Delegate, Q, "create">;`);
}

function addOneToOneMetaOnFieldRelation(writer: CodeBlockWriter, field: Field, models: readonly Model[]) {
  const otherModel = models.find(({ name }) => name === field.type)!;
  const otherModelKeyPath = JSON.parse(getUniqueIdentifiers(otherModel)[0].keyPath) as string[];

  writer
    .writeLine(`const fk: Partial<PrismaIDBSchema['${field.type}']['key']> = [];`)
    .writeLine(`if (query.data.${field.name}?.create)`)
    .block(() => {
      writer.writeLine(
        `const record = await this.client.${toCamelCase(field.type)}.create({ data: query.data.${field.name}.create }, tx);`,
      );
      for (let i = 0; i < otherModelKeyPath!.length; i++) {
        writer.writeLine(`fk[${i}] = record.${otherModelKeyPath?.at(i)}`);
      }
    });

  writer.writeLine(`if (query.data.${field.name}?.connect)`).block(() => {
    writer
      .writeLine(
        `const record = await this.client.${toCamelCase(field.type)}.findUniqueOrThrow({ where: query.data.${field.name}.connect }, tx);`,
      )
      .writeLine(`delete query.data.${field.name}.connect;`);
    for (let i = 0; i < otherModelKeyPath!.length; i++) {
      writer.writeLine(`fk[${i}] = record.${otherModelKeyPath?.at(i)};`);
    }
  });

  writer.writeLine(`if (query.data.${field.name}?.connectOrCreate)`).block(() => {
    writer
      .writeLine(`const record = await this.client.${toCamelCase(field.type)}.upsert({`)
      .writeLine(`where: query.data.${field.name}.connectOrCreate.where,`)
      .writeLine(`create: query.data.${field.name}.connectOrCreate.create,`)
      .writeLine(`update: {},`)
      .writeLine(`}, tx);`);
    for (let i = 0; i < otherModelKeyPath!.length; i++) {
      writer.writeLine(`fk[${i}] = record.${otherModelKeyPath?.at(i)};`);
    }
  });

  writer.writeLine(`const unsafeData = query.data as Record<string, unknown>;`);
  field.relationFromFields!.forEach((fromField, idx) => {
    writer.writeLine(`unsafeData.${fromField} = fk[${otherModelKeyPath.indexOf(field.relationToFields![idx])}];`);
  });
  writer.writeLine(`delete unsafeData.${field.name};`);
}

function addOneToOneMetaOnOtherFieldRelation(writer: CodeBlockWriter, field: Field, otherField: Field, model: Model) {
  const modelKeyPath = JSON.parse(getUniqueIdentifiers(model)[0].keyPath) as string[];

  const keyPathMapping = otherField
    .relationFromFields!.map(
      (field, idx) => `${field}: keyPath[${modelKeyPath.indexOf(otherField.relationToFields![idx])}]`,
    )
    .join(", ");

  writer.writeLine(`if (query.data.${field.name}?.create)`).block(() => {
    writer
      .write(`await this.client.${toCamelCase(field.type)}.create(`)
      .block(() => {
        writer.writeLine(
          `data: { ...query.data.${field.name}.create, ${keyPathMapping} } as Prisma.Args<Prisma.${field.type}Delegate, "create">["data"]`,
        );
      })
      .writeLine(`, tx)`);
  });
  writer.writeLine(`if (query.data.${field.name}?.connect)`).block(() => {
    writer.writeLine(
      `await this.client.${toCamelCase(field.type)}.update({ where: query.data.${field.name}.connect, data: { ${keyPathMapping} } }, tx);`,
    );
  });
  writer.writeLine(`if (query.data.${field.name}?.connectOrCreate)`).block(() => {
    writer.writeLine(`if (query.data.${field.name}?.connectOrCreate)`).block(() => {
      writer
        .writeLine(`await this.client.${toCamelCase(field.type)}.upsert({`)
        .writeLine(`where: query.data.${field.name}.connectOrCreate.where,`)
        .writeLine(
          `create: { ...query.data.${field.name}.connectOrCreate.create, ${keyPathMapping} } as Prisma.Args<Prisma.${field.type}Delegate, "create">["data"],`,
        )
        .writeLine(`update: { ${keyPathMapping} },`)
        .writeLine(`}, tx);`);
    });
  });
}

function addOneToManyRelation(
  writer: CodeBlockWriter,
  field: Field,
  otherField: Field,
  fkFields: Field[],
  model: Model,
) {
  const getCreateQuery = (extraDataFields: string) =>
    `await this.client.${toCamelCase(field.type)}.create({ data: { ...elem, ${extraDataFields} } as Prisma.Args<Prisma.${field.type}Delegate, "create">['data'] }, tx);`;

  const modelPk = getUniqueIdentifiers(model)[0];
  const modelPkFields = JSON.parse(modelPk.keyPath) as string[];
  const fields = `{ ${modelPkFields.map((field, idx) => `${field}: keyPath[${idx}]`).join(", ")} }`;

  let nestedConnectLine = `${otherField.name}: { connect: `;
  if (modelPkFields.length === 1) nestedConnectLine += `${fields}`;
  else nestedConnectLine += `{ ${modelPk.name}: ${fields} }`;
  nestedConnectLine += ` }`;

  const nestedDirectLine = otherField
    .relationFromFields!.map(
      (field, idx) =>
        `${field}: keyPath[${JSON.parse(getUniqueIdentifiers(model)[0].keyPath).indexOf(otherField.relationToFields?.at(idx))}]`,
    )
    .join(", ");
  const connectQuery = getCreateQuery(nestedConnectLine);

  writer.writeLine(`if (query.data?.${field.name}?.create)`).block(() => {
    if (fkFields.length === 1) {
      writer.writeLine(`for (const elem of IDBUtils.convertToArray(query.data.${field.name}.create))`).block(() => {
        writer.writeLine(connectQuery);
      });
    } else {
      /* 
        This is due to Prisma's create query's constraint of using either 
        { connect: { pk: value } } OR { fk: value } for all the fields
      */
      writer
        .writeLine(`const createData = Array.isArray(query.data.${field.name}.create)`)
        .writeLine(`? query.data.${field.name}.create`)
        .writeLine(`: [query.data.${field.name}.create]`)
        .writeLine(`for (const elem of createData)`)
        .block(() => {
          writer.writeLine(connectQuery);
        });
    }
  });

  writer.writeLine(`if (query.data?.${field.name}?.connect)`).block(() => {
    writer
      .writeLine(`await Promise.all(`)
      .indent(() => {
        writer
          .writeLine(`IDBUtils.convertToArray(query.data.${field.name}.connect).map(async (connectWhere) => `)
          .block(() => {
            writer.writeLine(
              `await this.client.${toCamelCase(field.type)}.update({ where: connectWhere, data: { ${nestedDirectLine} } }, tx);`,
            );
          })
          .writeLine(`),`);
      })
      .writeLine(");");
  });
  writer.writeLine(`if (query.data?.${field.name}?.connectOrCreate)`).block(() => {
    writer
      .writeLine(`await Promise.all(`)
      .indent(() => {
        writer
          .writeLine(
            `IDBUtils.convertToArray(query.data.${field.name}.connectOrCreate).map(async (connectOrCreate) => `,
          )
          .block(() => {
            writer
              .writeLine(`await this.client.${toCamelCase(field.type)}.upsert({`)
              .writeLine(`where: connectOrCreate.where,`)
              .writeLine(
                `create: { ...connectOrCreate.create, ${nestedDirectLine} } as NonNullable<Prisma.Args<Prisma.${field.type}Delegate, "create">["data"]>,`,
              )
              .writeLine(`update: { ${nestedDirectLine} },`)
              .writeLine(`}, tx);`);
          })
          .writeLine(`),`);
      })
      .writeLine(");");
  });
  writer.writeLine(`if (query.data?.${field.name}?.createMany)`).block(() => {
    writer
      .write(`await this.client.${toCamelCase(field.type)}.createMany(`)
      .block(() => {
        writer
          .writeLine(`data: IDBUtils.convertToArray(query.data.${field.name}.createMany.data).map((createData) => (`)
          .block(() => {
            writer.writeLine(`...createData, ${nestedDirectLine}`);
          })
          .writeLine(`)),`);
      })
      .writeLine(`, tx)`);
  });
}

function handleForeignKeyValidation(writer: CodeBlockWriter, field: Field, fkField: Field, models: readonly Model[]) {
  const otherModel = models.find(({ name }) => name === field.type)!;
  const otherModelPk = getUniqueIdentifiers(otherModel)[0];
  const otherModelPkFields = JSON.parse(otherModelPk.keyPath) as string[];

  writer
    .writeLine(`else if (query.data?.${fkField.name} !== undefined && query.data.${fkField.name} !== null)`)
    .block(() => {
      writer
        .writeLine(`await this.client.${toCamelCase(field.type)}.findUniqueOrThrow(`)
        .block(() => {
          const fieldValueMap = field
            .relationToFields!.map((from, idx) => `${from}: query.data.${field.relationFromFields?.at(idx)}`)
            .join(", ");

          if (otherModelPkFields.length === 1) {
            writer.writeLine(`where: { ${fieldValueMap} }`);
          } else {
            writer.writeLine(`where: { ${otherModelPk.name}: { ${fieldValueMap} } }`);
          }
        })
        .writeLine(`, tx);`);
    });
}
