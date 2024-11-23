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
      { name: "tx", type: "CreateTransactionType" },
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

    writer.writeLine(`if (data.${field.name})`).block(() => {
      handleVariousRelationships(writer, model, field, otherFieldOfRelation);
    });
  });
}

function handleVariousRelationships(writer: CodeBlockWriter, model: Model, field: Field, otherField: Field) {
  if (!field.isList) {
    if (field.isRequired) {
      addOneToOneMetaOnFieldRelation(writer, field);
    } else {
      addOneToOneMetaOnOtherFieldRelation(writer, field, otherField);
    }
  } else {
    // one-to-many
  }
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
  if (field.isList) {
    writer.writeLine(`if (data.${field.name}.createMany)`).block(() => {
      writer.writeLine(`throw new Error('createMany not yet implemented')`);
    });
  }
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
          `data: { ...data.profile.create, ${otherField.relationFromFields?.at(0)}: data.${otherField.relationToFields?.at(0)}! }`,
        );
      })
      .writeLine(`, tx)`);
  });
  writer.writeLine(`if (data.${field.name}.connectOrCreate)`).block(() => {
    writer.writeLine(`throw new Error('connectOrCreate not yet implemented')`);
  });
  if (field.isList) {
    writer.writeLine(`if (data.${field.name}.createMany)`).block(() => {
      writer.writeLine(`throw new Error('createMany not yet implemented')`);
    });
  }
  writer.writeLine(`delete data.${field.name};`);
}
