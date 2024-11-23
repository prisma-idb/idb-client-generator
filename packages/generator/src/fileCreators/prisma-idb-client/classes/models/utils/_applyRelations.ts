import { Field, Model } from "../../../../types";
import { toCamelCase } from "../../../../../helpers/utils";
import { ClassDeclaration, CodeBlockWriter, Scope } from "ts-morph";

export function addApplyRelations(modelClass: ClassDeclaration, model: Model, models: readonly Model[]) {
  modelClass.addMethod({
    name: "_applyRelations",
    isAsync: true,
    scope: Scope.Private,
    typeParameters: [{ name: "Q", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'findMany'>` }],
    parameters: [
      { name: "records", type: `Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>[]` },
      { name: "query", type: "Q", hasQuestionToken: true },
    ],
    returnType: `Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, 'findFirstOrThrow'>[]>`,
    statements: (writer) => {
      addEarlyExit(writer, model);
      addRelationProcessing(writer, model, models);
      addReturn(writer, model);
    },
  });
}

function addEarlyExit(writer: CodeBlockWriter, model: Model) {
  writer.writeLine(
    `if (!query) return records as Prisma.Result<Prisma.${model.name}Delegate, Q, 'findFirstOrThrow'>[];`,
  );
}

function addRelationProcessing(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const relationFields = model.fields.filter(({ kind }) => kind === "object");
  const allFields = models.flatMap(({ fields }) => fields);

  writer
    .writeLine("const recordsWithRelations = records.map(async (record) => ")
    .block(() => {
      writer.writeLine("const unsafeRecord = record as Record<string, unknown>;");
      relationFields.forEach((field) => {
        writer
          .write(`const attach_${field.name} = `)
          .write(`query.select?.${field.name} || query.include?.${field.name};`)
          .writeLine(`if (attach_${field.name})`)
          .block(() => {
            const otherFieldOfRelation = allFields.find(
              (_field) => _field.relationName === field.relationName && field !== _field,
            )!;
            handleVariousRelationships(writer, model, field, otherFieldOfRelation);
          });
      });
      writer.writeLine("return unsafeRecord;");
    })
    .writeLine(");");
}

function handleVariousRelationships(writer: CodeBlockWriter, model: Model, field: Field, otherField: Field) {
  if (!field.isList) {
    if (field.isRequired) {
      addOneToOneMetaOnFieldRelation(writer, field);
    } else {
      addOneToOneMetaOnOtherFieldRelation(writer, field, otherField);
    }
  } else {
    addOneToManyRelation(writer, field, otherField);
  }
}

function addOneToOneMetaOnFieldRelation(writer: CodeBlockWriter, field: Field) {
  writer
    .writeLine(`unsafeRecord['${field.name}'] = await this.client.${toCamelCase(field.type)}.findUnique(`)
    .block(() => {
      writer
        .writeLine(`...(attach_${field.name} === true ? {} : attach_${field.name}),`)
        .writeLine(`where: { ${field.relationToFields?.at(0)}: record.${field.relationFromFields?.at(0)} }`);
    })
    .writeLine(`)`);
}

function addOneToOneMetaOnOtherFieldRelation(writer: CodeBlockWriter, field: Field, otherField: Field) {
  writer
    .writeLine(`unsafeRecord['${field.name}'] = await this.client.${toCamelCase(field.type)}.findUnique(`)
    .block(() => {
      writer
        .writeLine(`...(attach_${field.name} === true ? {} : attach_${field.name}),`)
        .writeLine(`where: { ${otherField.relationFromFields?.at(0)}: record.${otherField.relationToFields?.at(0)} }`);
    })
    .writeLine(`)`);
}

function addOneToManyRelation(writer: CodeBlockWriter, field: Field, otherField: Field) {
  writer
    .writeLine(`unsafeRecord['${field.name}'] = await this.client.${toCamelCase(field.type)}.findMany(`)
    .block(() => {
      writer
        .writeLine(`...(attach_${field.name} === true ? {} : attach_${field.name}),`)
        .writeLine(`where: { ${otherField.relationFromFields?.at(0)}: record.${otherField.relationToFields?.at(0)} }`);
    })
    .writeLine(`)`);
}

function addReturn(writer: CodeBlockWriter, model: Model) {
  writer
    .write(`return (await Promise.all(recordsWithRelations)) as `)
    .write(`Prisma.Result<Prisma.${model.name}Delegate, Q, 'findFirstOrThrow'>[];`);
}
