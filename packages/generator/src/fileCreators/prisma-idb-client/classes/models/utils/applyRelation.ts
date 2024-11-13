import { Field, Model } from "../../../../types";
import { toCamelCase } from "../../../../../helpers/utils";
import { ClassDeclaration, CodeBlockWriter, Scope } from "ts-morph";

export function addApplyRelations(modelClass: ClassDeclaration, model: Model, models: readonly Model[]) {
  modelClass.addMethod({
    name: "applyRelations",
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

  writer
    .writeLine("const recordsWithRelations = records.map(async (record) => ")
    .block(() => {
      writer.writeLine("const unsafeRecord = record as Record<string, unknown>;");
      relationFields.forEach((field) => {
        writer
          .write(`const attach_${field.name} = `)
          .write(`query.select?.${toCamelCase(field.name)} || query.include?.${toCamelCase(field.name)};`)
          .writeLine(`if (attach_${field.name})`)
          .block(() => {
            const queryOptions = `attach_${field.name} === true ? {} : attach_${field.name}`;
            if (field.isList) {
              addOneToManyRelation(writer, field, models, queryOptions);
            } else {
              addManyToOneRelation(writer, field, queryOptions);
            }
          });
      });
      writer.writeLine("return unsafeRecord;");
    })
    .writeLine(");");
}

function addOneToManyRelation(writer: CodeBlockWriter, field: Field, models: readonly Model[], queryOptions: string) {
  const oppositeRelation = models
    .flatMap(({ fields }) => fields)
    .find((_field) => _field.relationName === field.relationName && _field !== field)!;

  writer
    .writeLine(`unsafeRecord['${field.name}'] = await this.client.${toCamelCase(field.type)}.findMany(`)
    .block(() => {
      writer.writeLine(`...${queryOptions},`);
      writer.writeLine(
        `where: { ${oppositeRelation.relationFromFields?.at(0)}: record.${oppositeRelation.relationToFields?.at(0)} }`,
      );
    })
    .writeLine(");");
}

function addManyToOneRelation(writer: CodeBlockWriter, field: Field, queryOptions: string) {
  if (field.isRequired) {
    writer
      .writeLine(`unsafeRecord['${field.name}'] = await this.client.${toCamelCase(field.type)}.findFirst(`)
      .block(() => {
        writer.writeLine(`...${queryOptions},`);
        writer.writeLine(`where: { ${field.relationToFields?.at(0)}: record.${field.relationFromFields?.at(0)} }`);
      })
      .writeLine(");");
  } else {
    writer
      .writeLine(`if (record.${field.relationFromFields?.at(0)} !== null)`)
      .block(() => {
        writer
          .writeLine(`unsafeRecord['${field.name}'] = await this.client.${toCamelCase(field.type)}.findFirst(`)
          .block(() => {
            writer.writeLine(`...${queryOptions},`);
            writer.writeLine(`where: { ${field.relationToFields?.at(0)}: record.${field.relationFromFields?.at(0)} }`);
          })
          .writeLine(");");
      })
      .writeLine("else")
      .block(() => {
        writer.writeLine(`unsafeRecord['${field.name}'] = null;`);
      });
  }
}

function addReturn(writer: CodeBlockWriter, model: Model) {
  writer
    .write(`return (await Promise.all(recordsWithRelations)) as `)
    .write(`Prisma.Result<Prisma.${model.name}Delegate, Q, 'findFirstOrThrow'>[];`);
}
