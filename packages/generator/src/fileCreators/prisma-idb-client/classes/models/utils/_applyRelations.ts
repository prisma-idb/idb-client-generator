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

/**
 * Emits code that attaches a one-to-one related record to `unsafeRecord[field.name]` when the relation is declared on the field itself.
 *
 * The generated code performs a conditional null-check for optional relations, builds the appropriate composite key (single- or multi-field), and emits a Prisma `findUnique` call against the related model including the transaction context.
 *
 * @param field - Metadata for the relation field on the current model; used to resolve relation columns, nullability, and target model.
 * @param models - All available models used to locate the related model and its unique identifier key path.
 */
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
    .writeLine(`, { tx })`);
}

/**
 * Emits code to attach a one-to-one relation when the relation is defined on the other model's field.
 *
 * Generates an assignment that sets `unsafeRecord[field.name]` to the related record returned by a
 * `findUnique` call on the related model. The generated `where` clause maps `otherField.relationFromFields`
 * to the corresponding values on the current record via `otherField.relationToFields`, handling single-field
 * and composite keys. The emitted call also conditionally spreads `attach_{field.name}` and passes the
 * transaction context `{ tx }`.
 *
 * @param field - The relation field on the current model to populate
 * @param otherField - The corresponding relation field on the related model whose `relationFromFields`
 *   and `relationToFields` determine the `where` mapping
 */
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
    .writeLine(`, { tx })`);
}

/**
 * Generates code that assigns the result of a one-to-many query to the specified relation field on a record.
 *
 * @param writer - The code writer used to emit the assignment and Prisma query.
 * @param field - The relation field on the current model that will receive the related records.
 * @param otherField - The opposite relation field on the related model whose relationFromFields/relationToFields are used to build the foreign-key mapping.
 */
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
    .writeLine(`, { tx })`);
}

/**
 * Emit a return statement that resolves all per-record relation promises and casts the result to the model's Prisma result array type.
 *
 * @returns An array of results typed as `Prisma.Result<Prisma.{ModelName}Delegate, Q, 'findFirstOrThrow'>` for the provided model
 */
function addReturn(writer: CodeBlockWriter, model: Model) {
  writer
    .write(`return (await Promise.all(recordsWithRelations)) as `)
    .write(`Prisma.Result<Prisma.${model.name}Delegate, Q, 'findFirstOrThrow'>[];`);
}