import { ClassDeclaration, CodeBlockWriter, Scope } from "ts-morph";
import { Field, Model } from "../../../../types";
import { toCamelCase } from "../../../../../helpers/utils";

// TODO: handle composite keyPaths, oneToMany, createMany
// TODO: connect and then, connectOrCreate

export function addPerformNestedCreatesMethod(modelClass: ClassDeclaration, model: Model, models: readonly Model[]) {
  modelClass.addMethod({
    scope: Scope.Private,
    name: "_performNestedCreates",
    isAsync: true,
    typeParameters: [{ name: "D", constraint: `Prisma.Args<Prisma.${model.name}Delegate, "create">["data"]` }],
    parameters: [
      { name: "data", type: "D" },
      { name: "tx", type: "IDBUtils.ReadwriteTransactionType" },
      { name: "validateFKs", initializer: "true" },
    ],
    returnType: ``,
    statements: (writer) => {
      addRelationProcessing(writer, model, models);
    },
  });
}

function addRelationProcessing(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const relationFields = model.fields.filter(({ kind }) => kind === "object");
  const allFields = models.flatMap(({ fields }) => fields);

  relationFields.forEach((field) => {
    const otherFieldOfRelation = allFields.find(
      (_field) => _field.relationName === field.relationName && field !== _field,
    )!;
    const foreignKeyField = model.fields.find((fkField) => fkField.name === field.relationFromFields?.at(0));

    writer.writeLine(`if (data.${field.name})`).block(() => {
      handleVariousRelationships(writer, field, otherFieldOfRelation);
    });
    if (foreignKeyField) {
      handleForeignKeyValidation(writer, field, foreignKeyField);
    }
  });
}

function handleVariousRelationships(writer: CodeBlockWriter, field: Field, otherField: Field) {
  if (!field.isList) {
    if (field.relationFromFields?.length) {
      addOneToOneMetaOnFieldRelation(writer, field);
    } else {
      addOneToOneMetaOnOtherFieldRelation(writer, field, otherField);
    }
  } else {
    addOneToManyRelation(writer, field, otherField);
  }
}

function handleForeignKeyValidation(writer: CodeBlockWriter, field: Field, fkField: Field) {
  writer
    .writeLine(
      `if (validateFKs && (data.${fkField.name} !== undefined || data.${field.name}?.connect?.id !== undefined))`,
    )
    .block(() => {
      writer
        // TODO: composite FKs
        .writeLine(`const fk = data.${fkField.name} ?? data.${field.name}?.connect?.id as number;`)
        .writeLine(`const record = await tx.objectStore("${field.type}").getKey([fk]);`)
        .writeLine(`if (record === undefined)`)
        .block(() => {
          writer.writeLine(
            `throw new Error(\`Foreign key (\${data.${fkField.name}}) for model (${field.type}) does not exist\`);`,
          );
        });
    });
}

function addOneToOneMetaOnFieldRelation(writer: CodeBlockWriter, field: Field) {
  writer
    .writeLine(`let fk;`)
    .writeLine(`if (data.${field.name}.create)`)
    .block(() => {
      writer.writeLine(
        `fk = (await this.client.${toCamelCase(field.type)}._nestedCreate({ data: data.${field.name}.create }, tx))[0];`,
      );
    });
  writer.writeLine(`if (data.${field.name}.connectOrCreate)`).block(() => {
    writer.writeLine(`throw new Error('connectOrCreate not yet implemented')`);
  });
  writer
    .writeLine(`const unsafeData = data as Record<string, unknown>;`)
    .writeLine(`unsafeData.userId = fk as NonNullable<typeof fk>;`)
    .writeLine(`delete unsafeData.${field.name};`);
}

function addOneToOneMetaOnOtherFieldRelation(writer: CodeBlockWriter, field: Field, otherField: Field) {
  writer.writeLine(`if (data.${field.name}.create)`).block(() => {
    writer
      .write(`await this.client.${toCamelCase(field.type)}._nestedCreate(`)
      .block(() => {
        writer.writeLine(
          `data: { ...data.${field.name}.create, ${otherField.relationFromFields?.at(0)}: data.${otherField.relationToFields?.at(0)}! }`,
        );
      })
      .writeLine(`, tx)`);
  });
  writer.writeLine(`if (data.${field.name}.connectOrCreate)`).block(() => {
    writer.writeLine(`throw new Error('connectOrCreate not yet implemented')`);
  });
  writer.writeLine(`delete data.${field.name};`);
}

function addOneToManyRelation(writer: CodeBlockWriter, field: Field, otherField: Field) {
  writer.writeLine(`if (data.${field.name}.create)`).block(() => {
    writer
      .write(`await this.client.${toCamelCase(field.type)}.createMany(`)
      .block(() => {
        writer
          .writeLine(`data: IDBUtils.convertToArray(data.${field.name}.create).map((createData) => (`)
          .block(() => {
            writer.writeLine(
              `...createData, ${otherField.relationFromFields?.at(0)}: data.${otherField.relationToFields?.at(0)}!`,
            );
          })
          .writeLine(`)),`);
      })
      .writeLine(`, tx)`);
  });
  writer.writeLine(`if (data.${field.name}.connectOrCreate)`).block(() => {
    writer.writeLine(`throw new Error('connectOrCreate not yet implemented')`);
  });
  writer.writeLine(`if (data.${field.name}.createMany)`).block(() => {
    writer
      .write(`await this.client.${toCamelCase(field.type)}.createMany(`)
      .block(() => {
        writer
          .writeLine(`data: IDBUtils.convertToArray(data.${field.name}.createMany.data).map((createData) => (`)
          .block(() => {
            writer.writeLine(
              `...createData, ${otherField.relationFromFields?.at(0)}: data.${otherField.relationToFields?.at(0)}!`,
            );
          })
          .writeLine(`)),`);
      })
      .writeLine(`, tx)`);
  });
  writer.writeLine(`delete data.${field.name};`);
}
