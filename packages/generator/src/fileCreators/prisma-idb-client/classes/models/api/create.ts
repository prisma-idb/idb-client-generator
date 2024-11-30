import { ClassDeclaration, CodeBlockWriter } from "ts-morph";
import { Field, Model } from "../../../../../fileCreators/types";
import { toCamelCase } from "../../../../../helpers/utils";

// TODO: referential integrity?
// TODO: nested creates, connect, connectOrCreate

export function addCreateMethod(modelClass: ClassDeclaration, model: Model, models: readonly Model[]) {
  modelClass.addMethod({
    name: "create",
    isAsync: true,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "create">` }],
    parameters: [
      { name: "query", type: "Q" },
      { name: "tx", hasQuestionToken: true, type: "IDBUtils.ReadwriteTransactionType" },
    ],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, "create">>`,
    statements: (writer) => {
      createTx(writer);
      createDependencies(writer, model);
      createCurrentModel(writer, model);
      createDependents(writer, model, models);
      applyClausesAndReturnRecords(writer, model);
    },
  });
}

function createTx(writer: CodeBlockWriter) {
  writer
    .writeLine(`const storesNeeded = this._getNeededStoresForCreate(query.data);`)
    .writeLine(`tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");`);
}

function createDependencies(writer: CodeBlockWriter, model: Model) {
  model.fields.forEach((field) => {
    if (!field.relationName) return;
    if (field.relationFromFields?.length === 0 || field.relationToFields?.length === 0) return;
    const foreignKeyField = model.fields.find((fkField) => fkField.name === field.relationFromFields?.at(0))!;

    writer.writeLine(`if (query.data.${field.name})`).block(() => {
      addOneToOneMetaOnFieldRelation(writer, field);
    });
    handleForeignKeyValidation(writer, field, foreignKeyField);
  });
}

function createCurrentModel(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));`)
    .writeLine(`const keyPath = await tx.objectStore("${model.name}").add(record);`);
}

function createDependents(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const allFields = models.flatMap((model) => model.fields);
  model.fields.forEach((field) => {
    if (!field.relationName) return;
    if (field.relationFromFields?.length || field.relationToFields?.length) return;
    const otherField = allFields.find(
      (otherField) => otherField !== field && otherField.relationName === field.relationName,
    )!;

    if (!field.isList) {
      addOneToOneMetaOnOtherFieldRelation(writer, field, otherField);
    } else {
      addOneToManyRelation(writer, field, otherField);
    }
  });
}

function applyClausesAndReturnRecords(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`const data = (await tx.objectStore("${model.name}").get(keyPath))!;`)
    .write(`const recordsWithRelations = this._applySelectClause`)
    .write(`(await this._applyRelations([data], tx, query), query.select)[0];`);

  writer.writeLine(`return recordsWithRelations as Prisma.Result<Prisma.${model.name}Delegate, Q, "create">;`);
}

function addOneToOneMetaOnFieldRelation(writer: CodeBlockWriter, field: Field) {
  writer
    .writeLine(`let fk;`)
    .writeLine(`if (query.data.${field.name}?.create)`)
    .block(() => {
      writer.writeLine(
        `fk = (await this.client.${toCamelCase(field.type)}.create({ data: query.data.${field.name}.create }, tx)).${field.relationToFields?.at(0)};`,
      );
    });
  writer.writeLine(`if (query.data.${field.name}?.connectOrCreate)`).block(() => {
    writer.writeLine(`throw new Error('connectOrCreate not yet implemented')`);
  });

  writer
    .writeLine(`const unsafeData = query.data as Record<string, unknown>;`)
    .writeLine(`unsafeData.${field.relationFromFields?.at(0)} = fk as NonNullable<typeof fk>;`)
    .writeLine(`delete unsafeData.${field.name};`);
}

function addOneToOneMetaOnOtherFieldRelation(writer: CodeBlockWriter, field: Field, otherField: Field) {
  writer.writeLine(`if (query.data.${field.name}?.create)`).block(() => {
    writer
      .write(`await this.client.${toCamelCase(field.type)}.create(`)
      .block(() => {
        writer.writeLine(
          `data: { ...query.data.${field.name}.create, ${otherField.relationFromFields?.at(0)}: keyPath[0] }`,
        );
      })
      .writeLine(`, tx)`);
  });
  writer.writeLine(`if (query.data.${field.name}?.connectOrCreate)`).block(() => {
    writer.writeLine(`throw new Error('connectOrCreate not yet implemented')`);
  });
}

function addOneToManyRelation(writer: CodeBlockWriter, field: Field, otherField: Field) {
  writer.writeLine(`if (query.data.${field.name}?.create)`).block(() => {
    writer
      .write(`await this.client.${toCamelCase(field.type)}.createMany(`)
      .block(() => {
        writer
          .writeLine(`data: IDBUtils.convertToArray(query.data.${field.name}.create).map((createData) => (`)
          .block(() => {
            writer.writeLine(`...createData, ${otherField.relationFromFields?.at(0)}: keyPath[0]`);
          })
          .writeLine(`)),`);
      })
      .writeLine(`, tx)`);
  });
  writer.writeLine(`if (query.data.${field.name}?.connectOrCreate)`).block(() => {
    writer.writeLine(`throw new Error('connectOrCreate not yet implemented')`);
  });
  writer.writeLine(`if (query.data.${field.name}?.createMany)`).block(() => {
    writer
      .write(`await this.client.${toCamelCase(field.type)}.createMany(`)
      .block(() => {
        writer
          .writeLine(`data: IDBUtils.convertToArray(query.data.${field.name}.createMany.data).map((createData) => (`)
          .block(() => {
            writer.writeLine(`...createData, ${otherField.relationFromFields?.at(0)}: keyPath[0]`);
          })
          .writeLine(`)),`);
      })
      .writeLine(`, tx)`);
  });
}

function handleForeignKeyValidation(writer: CodeBlockWriter, field: Field, fkField: Field) {
  writer
    .writeLine(`if (query.data.${fkField.name} !== undefined || query.data.${field.name}?.connect?.id !== undefined)`)
    .block(() => {
      writer
        // TODO: composite FKs
        .writeLine(`const fk = query.data.${fkField.name} ?? query.data.${field.name}?.connect?.id as number;`)
        .writeLine(`const record = await tx.objectStore("${field.type}").getKey([fk]);`)
        .writeLine(`if (record === undefined)`)
        .block(() => {
          writer.writeLine(
            `throw new Error(\`Foreign key (\${query.data.${fkField.name}}) for model (${field.type}) does not exist\`);`,
          );
        });
    });
}
