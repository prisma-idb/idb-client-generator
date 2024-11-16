import { ClassDeclaration, CodeBlockWriter, Scope } from "ts-morph";
import { Field, Model } from "../../../../../fileCreators/types";
import { toCamelCase } from "../../../../../helpers/utils";

export function addPerformNestedCreatesMethod(modelClass: ClassDeclaration, model: Model, models: readonly Model[]) {
  modelClass.addMethod({
    scope: Scope.Private,
    name: "performNestedCreates",
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
  if (!field.isList && !otherField.isList) {
    if (field.isRequired) {
      addOneToOneMetaOnFieldRelation(writer, field);
    } else {
      addOneToOneMetaOnOtherFieldRelation(writer, field, otherField);
    }
    // } else if (field.isList) {
    //   relationshipType = "ManyToOne";
    // } else {
    //   relationshipType = "OneToMany";
  }
}

function addOneToOneMetaOnFieldRelation(writer: CodeBlockWriter, field: Field) {
  // TODO
}

function addOneToOneMetaOnOtherFieldRelation(writer: CodeBlockWriter, field: Field, otherField: Field) {
  writer.writeLine(`if (data.${field.name}.create)`).block(() => {
    writer
      .writeLine(`await Promise.all(`)
      .writeLine(`convertToArray(data.${field.name}.create).map(async (record) => `)
      .write(`await this.client.${toCamelCase(field.type)}._nestedCreate(`)
      .block(() => {
        writer.writeLine(
          `data: { ...record, ${otherField.relationFromFields?.at(0)}: data.${otherField.relationToFields?.at(0)}! }`,
        );
      })
      .writeLine(`, tx)),`)
      .writeLine(")");
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
