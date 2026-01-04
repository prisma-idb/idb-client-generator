import CodeBlockWriter from "code-block-writer";
import { getUniqueIdentifiers, toCamelCase } from "../../../../../helpers/utils";
import { Field, Model } from "../../../../types";

export function addApplyRelations(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  writer
    .writeLine(`private async _applyRelations<Q extends Prisma.Args<Prisma.${model.name}Delegate, 'findMany'>>(`)
    .writeLine(`records: Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>[],`)
    .writeLine(`tx: IDBUtils.TransactionType,`)
    .writeLine(`query?: Q): Promise<Prisma.Result<Prisma.${model.name}Delegate, Q, 'findFirstOrThrow'>[]>`)
    .block(() => {
      addEarlyExit(writer, model);
      addRelationProcessing(writer, model, models);
      addReturn(writer, model);
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
            handleVariousRelationships(writer, field, otherFieldOfRelation, models);
          });
      });
      writer.writeLine("return unsafeRecord;");
    })
    .writeLine(");");
}

function handleVariousRelationships(
  writer: CodeBlockWriter,
  field: Field,
  otherField: Field,
  models: readonly Model[],
) {
  if (!field.isList) {
    if (field.relationFromFields?.length) {
      addOneToOneMetaOnFieldRelation(writer, field, models);
    } else {
      addOneToOneMetaOnOtherFieldRelation(writer, field, otherField);
    }
  } else {
    addOneToManyRelation(writer, field, otherField);
  }
}

function addOneToOneMetaOnFieldRelation(writer: CodeBlockWriter, field: Field, models: readonly Model[]) {
  const otherModel = models.find(({ name }) => name === field.type)!;
  const otherModelKeyPath = JSON.parse(getUniqueIdentifiers(otherModel)[0].keyPath) as string[];

  const compositeKeyName = otherModelKeyPath.join("_");
  const compositeKey = otherModelKeyPath
    .map((toField) => `${toField}: record.${field.relationFromFields?.at(field.relationToFields!.indexOf(toField))}!`)
    .join(", ");

  writer
    .write(`unsafeRecord['${field.name}'] = `)
    .conditionalWrite(!field.isRequired, () => `record.${field.relationFromFields?.at(0)} === null ? null :`)
    .writeLine(`await this.client.${toCamelCase(field.type)}.findUnique(`)
    .block(() => {
      writer.writeLine(`...(attach_${field.name} === true ? {} : attach_${field.name}),`);
      if (field.relationFromFields?.length === 1) {
        writer.writeLine(`where: { ${compositeKey} }`);
      } else {
        writer.writeLine(`where: { ${compositeKeyName}: { ${compositeKey} } }`);
      }
    })
    .writeLine(`, tx)`);
}

function addOneToOneMetaOnOtherFieldRelation(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const compositeKeyName = otherField.relationFromFields!.join("_");
  const compositeKey = otherField
    .relationFromFields!.map((fromField, idx) => `${fromField}: record.${otherField.relationToFields?.at(idx)}`)
    .join(", ");

  writer
    .writeLine(`unsafeRecord['${field.name}'] = await this.client.${toCamelCase(field.type)}.findUnique(`)
    .block(() => {
      writer.writeLine(`...(attach_${field.name} === true ? {} : attach_${field.name}),`);
      if (otherField.relationFromFields?.length === 1) {
        writer.writeLine(`where: { ${compositeKey} }`);
      } else {
        writer.writeLine(`where: { ${compositeKeyName}: { ${compositeKey} } }`);
      }
    })
    .writeLine(`, tx)`);
}

function addOneToManyRelation(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const fkMapping = otherField
    .relationFromFields!.map((fromField, idx) => `${fromField}: record.${otherField.relationToFields?.at(idx)}!`)
    .join(", ");

  writer
    .writeLine(`unsafeRecord['${field.name}'] = await this.client.${toCamelCase(field.type)}.findMany(`)
    .block(() => {
      writer
        .writeLine(`...(attach_${field.name} === true ? {} : attach_${field.name}),`)
        .writeLine(`where: { ${fkMapping} }`);
    })
    .writeLine(`, tx)`);
}

function addReturn(writer: CodeBlockWriter, model: Model) {
  writer
    .write(`return (await Promise.all(recordsWithRelations)) as `)
    .write(`Prisma.Result<Prisma.${model.name}Delegate, Q, 'findFirstOrThrow'>[];`);
}
