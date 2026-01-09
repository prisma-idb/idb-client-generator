import type { Field, Model } from "src/fileCreators/types";
import CodeBlockWriter from "code-block-writer";
import { toCamelCase } from "../../../../../helpers/utils";

// TODO: composite key handling in _applyWhereClause, _resolveOrderByKey, _applyRelations
// TODO: update (fk validation should be of all key parts instead of just the first one)
// * see working tree changes in prisma-idb-client.ts for more details

export function addApplyWhereClause(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  writer
    .writeLine(`private async _applyWhereClause<`)
    .writeLine(`W extends Prisma.Args<Prisma.${model.name}Delegate, 'findFirstOrThrow'>['where'],`)
    .writeLine(`R extends Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>,`)
    .writeLine(`>(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]>`)
    .block(() => {
      writer.writeLine(`if (!whereClause) return records;`);
      addLogicalFiltering(writer, model);
      writer
        .writeLine(`return (await Promise.all(records.map(async (record) =>`)
        .block(() => {
          addStringFiltering(writer, model);
          addNumberFiltering(writer, model);
          addBigIntFiltering(writer, model);
          addBoolFiltering(writer, model);
          addBytesFiltering(writer, model);
          addDateTimeFiltering(writer, model);
          // TODO: Decimal and JSON
          addRelationFiltering(writer, model, models);
          writer.writeLine(`return record;`);
        })
        .writeLine(`))).filter((result) => result !== null);`);
    });
}

function addLogicalFiltering(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`records = await IDBUtils.applyLogicalFilters<Prisma.${model.name}Delegate, R, W>(`)
    .writeLine(`records, whereClause, tx, this.keyPath, this._applyWhereClause.bind(this),`)
    .writeLine(`)`);
}

function addStringFiltering(writer: CodeBlockWriter, model: Model) {
  const stringFields = model.fields.filter((field) => field.type === "String" && !field.isList).map(({ name }) => name);
  if (stringFields.length > 0) {
    writer
      .writeLine(`const stringFields = ${JSON.stringify(stringFields)} as const;`)
      .writeLine(`for (const field of stringFields)`)
      .block(() => {
        writer.writeLine(`if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;`);
      });
  }

  const stringListFields = model.fields
    .filter((field) => field.type === "String" && field.isList)
    .map(({ name }) => name);
  if (stringListFields.length > 0) {
    writer
      .writeLine(`const stringListFields = ${JSON.stringify(stringListFields)} as const;`)
      .writeLine(`for (const field of stringListFields)`)
      .block(() => {
        writer.writeLine(`if (!IDBUtils.whereStringListFilter(record, field, whereClause[field])) return null;`);
      });
  }
}

function addNumberFiltering(writer: CodeBlockWriter, model: Model) {
  const numberFields = model.fields
    .filter((field) => (field.type === "Int" || field.type === "Float") && !field.isList)
    .map(({ name }) => name);
  if (numberFields.length > 0) {
    writer
      .writeLine(`const numberFields = ${JSON.stringify(numberFields)} as const;`)
      .writeLine(`for (const field of numberFields)`)
      .block(() => {
        writer.writeLine(`if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;`);
      });
  }

  const numberListFields = model.fields
    .filter((field) => (field.type === "Int" || field.type === "Float") && field.isList)
    .map(({ name }) => name);
  if (numberListFields.length > 0) {
    writer
      .writeLine(`const numberListFields = ${JSON.stringify(numberListFields)} as const;`)
      .writeLine(`for (const field of numberListFields)`)
      .block(() => {
        writer.writeLine(`if (!IDBUtils.whereNumberListFilter(record, field, whereClause[field])) return null;`);
      });
  }
}

/**
 * Emits code that adds BigInt-based where-clause filtering for a model.
 *
 * Writes const arrays of scalar and list BigInt field names (when present) and
 * generates per-field loops that call `IDBUtils.whereBigIntFilter` for scalar
 * fields and `IDBUtils.whereBigIntListFilter` for list fields; if a filter
 * fails for a record the generated code returns `null` for that record.
 *
 * @param writer - The CodeBlockWriter used to emit TypeScript code.
 * @param model - Metadata for the model whose BigInt fields should be processed.
 */
function addBigIntFiltering(writer: CodeBlockWriter, model: Model) {
  const bigIntFields = model.fields.filter((field) => field.type === "BigInt" && !field.isList).map(({ name }) => name);
  if (bigIntFields.length > 0) {
    writer
      .writeLine(`const bigIntFields = ${JSON.stringify(bigIntFields)} as const;`)
      .writeLine(`for (const field of bigIntFields)`)
      .block(() => {
        writer.writeLine(`if (!IDBUtils.whereBigIntFilter(record, field, whereClause[field])) return null;`);
      });
  }

  const bigIntListFields = model.fields
    .filter((field) => field.type === "BigInt" && field.isList)
    .map(({ name }) => name);
  if (bigIntListFields.length > 0) {
    writer
      .writeLine(`const bigIntListFields = ${JSON.stringify(bigIntListFields)} as const;`)
      .writeLine(`for (const field of bigIntListFields)`)
      .block(() => {
        writer.writeLine(`if (!IDBUtils.whereBigIntListFilter(record, field, whereClause[field])) return null;`);
      });
  }
}

function addBoolFiltering(writer: CodeBlockWriter, model: Model) {
  const booleanFields = model.fields
    .filter((field) => field.type === "Boolean" && !field.isList)
    .map(({ name }) => name);

  if (booleanFields.length > 0) {
    writer
      .writeLine(`const booleanFields = ${JSON.stringify(booleanFields)} as const;`)
      .writeLine(`for (const field of booleanFields)`)
      .block(() => {
        writer.writeLine(`if (!IDBUtils.whereBoolFilter(record, field, whereClause[field])) return null;`);
      });
  }

  const booleanListFields = model.fields
    .filter((field) => field.type === "Boolean" && field.isList)
    .map(({ name }) => name);

  if (booleanListFields.length > 0) {
    writer
      .writeLine(`const booleanListFields = ${JSON.stringify(booleanListFields)} as const;`)
      .writeLine(`for (const field of booleanListFields)`)
      .block(() => {
        writer.writeLine(`if (!IDBUtils.whereBooleanListFilter(record, field, whereClause[field])) return null;`);
      });
  }
}

function addBytesFiltering(writer: CodeBlockWriter, model: Model) {
  const bytesFields = model.fields.filter((field) => field.type === "Bytes" && !field.isList).map(({ name }) => name);
  if (bytesFields.length > 0) {
    writer
      .writeLine(`const bytesFields = ${JSON.stringify(bytesFields)} as const;`)
      .writeLine(`for (const field of bytesFields)`)
      .block(() => {
        writer.writeLine(`if (!IDBUtils.whereBytesFilter(record, field, whereClause[field])) return null;`);
      });
  }

  const bytesListFields = model.fields
    .filter((field) => field.type === "Bytes" && field.isList)
    .map(({ name }) => name);
  if (bytesListFields.length > 0) {
    writer
      .writeLine(`const bytesListFields = ${JSON.stringify(bytesListFields)} as const;`)
      .writeLine(`for (const field of bytesListFields)`)
      .block(() => {
        writer.writeLine(`if (!IDBUtils.whereBytesListFilter(record, field, whereClause[field])) return null;`);
      });
  }
}

function addDateTimeFiltering(writer: CodeBlockWriter, model: Model) {
  const dateTimeFields = model.fields
    .filter((field) => field.type === "DateTime" && !field.isList)
    .map(({ name }) => name);
  if (dateTimeFields.length > 0) {
    writer
      .writeLine(`const dateTimeFields = ${JSON.stringify(dateTimeFields)} as const;`)
      .writeLine(`for (const field of dateTimeFields)`)
      .block(() => {
        writer.writeLine(`if (!IDBUtils.whereDateTimeFilter(record, field, whereClause[field])) return null;`);
      });
  }

  const dateTimeListFields = model.fields
    .filter((field) => field.type === "DateTime" && field.isList)
    .map(({ name }) => name);
  if (dateTimeListFields.length > 0) {
    writer
      .writeLine(`const dateTimeListFields = ${JSON.stringify(dateTimeListFields)} as const;`)
      .writeLine(`for (const field of dateTimeListFields)`)
      .block(() => {
        writer.writeLine(`if (!IDBUtils.whereDateTimeListFilter(record, field, whereClause[field])) return null;`);
      });
  }
}

function addRelationFiltering(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const relationFields = model.fields.filter(({ kind }) => kind === "object");
  const allFields = models.flatMap(({ fields }) => fields);

  relationFields.forEach((field) => {
    const otherField = allFields.find((_field) => _field.relationName === field.relationName && field !== _field)!;
    if (!field.isList) {
      if (field.relationFromFields?.length) {
        addOneToOneMetaOnFieldFiltering(writer, field);
      } else {
        addOneToOneMetaOnOtherFieldFiltering(writer, field, otherField);
      }
    } else {
      addOneToManyFiltering(writer, field, otherField);
    }
  });
}

/**
 * Emits code to apply one-to-one relation filters for a relation defined on the given field.
 *
 * Generates checks that enforce `is`, `isNot`, and other nested where conditions for the related record,
 * respects the field's required/optional semantics (including explicit `null` handling), and emits Prisma
 * lookups that validate the existence or absence of the related record using the transaction context.
 *
 * @param field - Metadata for the one-to-one relation field on the current model used to build foreign-key mappings and nullable behavior
 */
function addOneToOneMetaOnFieldFiltering(writer: CodeBlockWriter, field: Field) {
  const fkName = field.relationFromFields?.at(0);
  const fkMapping = field.relationToFields
    ?.map((fk, idx) => `${fk}: record.${field.relationFromFields?.at(idx)}`)
    .join(", ");

  if (!field.isRequired) {
    writer.writeLine(`if (whereClause.${field.name} === null)`).block(() => {
      writer.writeLine(`if (record.${fkName} !== null) return null;`);
    });
  }

  writer.writeLine(`if (whereClause.${field.name})`).block(() => {
    writer.writeLine(`const { is, isNot, ...rest } = whereClause.${field.name}`);
    if (!field.isRequired) {
      writer.writeLine(`if (is === null)`).block(() => {
        writer.writeLine(`if (record.${fkName} !== null) return null;`);
      });
    }
    writer.writeLine(`if (is !== null && is !== undefined)`).block(() => {
      writer
        .conditionalWriteLine(!field.isRequired, () => `if (record.${fkName} === null) return null;`)
        .writeLine(
          `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ...is, ${fkMapping} } }, { tx })`,
        )
        .writeLine(`if (!relatedRecord) return null;`);
    });

    if (!field.isRequired) {
      writer.writeLine(`if (isNot === null)`).block(() => {
        writer.writeLine(`if (record.${fkName} === null) return null;`);
      });
    }
    writer.writeLine(`if (isNot !== null && isNot !== undefined)`).block(() => {
      writer
        .conditionalWriteLine(!field.isRequired, () => `if (record.${fkName} === null) return null;`)
        .writeLine(
          `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ...isNot, ${fkMapping} } }, { tx })`,
        )
        .writeLine(`if (relatedRecord) return null;`);
    });

    writer.writeLine(`if (Object.keys(rest).length)`).block(() => {
      writer
        .conditionalWriteLine(!field.isRequired, () => `if (record.${fkName} === null) return null;`)
        .writeLine(
          `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ...whereClause.${field.name}, ${fkMapping} } }, { tx });`,
        )
        .writeLine(`if (!relatedRecord) return null;`);
    });
  });
}

/**
 * Emits code to enforce a one-to-one relation filter for a relation defined on the opposite model field.
 *
 * Generates conditional checks for nullable vs required relations and for `is`, `isNot`, and remaining nested criteria from the provided where clause; when necessary it emits Prisma client queries (using the transaction `tx`) to verify the existence or absence of the related record and causes the current record to be filtered out by emitting `return null` checks.
 *
 * @param writer - Code emitter used to write the generated TypeScript code
 * @param field - The relation field on the current model being filtered
 * @param otherField - The corresponding relation field on the related model used to build the foreign-key mapping
 */
function addOneToOneMetaOnOtherFieldFiltering(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const fkMapping = otherField.relationFromFields
    ?.map((fk, idx) => `${fk}: record.${otherField.relationToFields?.at(idx)}`)
    .join(", ");

  if (!field.isRequired) {
    writer.writeLine(`if (whereClause.${field.name} === null)`).block(() => {
      writer
        .writeLine(`const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst(`)
        .block(() => {
          writer.writeLine(`where: { ${fkMapping} },`);
        })
        .writeLine(`, { tx });`)
        .writeLine(`if (relatedRecord) return null;`);
    });
  }

  writer.writeLine(`if (whereClause.${field.name})`).block(() => {
    writer.writeLine(`const { is, isNot, ...rest } = whereClause.${field.name}`);
    if (!field.isRequired) {
      writer.writeLine(`if (is === null)`).block(() => {
        writer
          .writeLine(
            `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ${fkMapping} } }, { tx })`,
          )
          .writeLine(`if (relatedRecord) return null;`);
      });
    }
    writer.writeLine(`if (is !== null && is !== undefined)`).block(() => {
      writer
        .writeLine(
          `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ...is, ${fkMapping} } }, { tx });`,
        )
        .writeLine(`if (!relatedRecord) return null;`);
    });

    if (!field.isRequired) {
      writer.writeLine(`if (isNot === null)`).block(() => {
        writer
          .writeLine(
            `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ${fkMapping} } }, { tx })`,
          )
          .writeLine(`if (!relatedRecord) return null;`);
      });
    }
    writer.writeLine(`if (isNot !== null && isNot !== undefined)`).block(() => {
      writer
        .writeLine(
          `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ...isNot, ${fkMapping} } }, { tx })`,
        )
        .writeLine(`if (relatedRecord) return null;`);
    });

    writer.writeLine(`if (Object.keys(rest).length)`).block(() => {
      writer
        .conditionalWriteLine(
          !field.isRequired,
          () => `if (record.${otherField.relationToFields?.at(0)} === null) return null;`,
        )
        .writeLine(
          `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ...whereClause.${field.name}, ${fkMapping} } }, { tx });`,
        )
        .writeLine(`if (!relatedRecord) return null;`);
    });
  });
}

/**
 * Generates code that applies `every`, `some`, and `none` one-to-many relation filters for the given relation field.
 *
 * Emits checks that query the related model using the foreign-key mapping and cause the current record to be excluded when a relation operator's condition is not satisfied.
 *
 * @param writer - The code writer used to emit the filtering logic
 * @param field - The relation field on the current model that holds the list of related records
 * @param otherField - The corresponding relation field on the related model used to build the foreign-key mapping
 */
function addOneToManyFiltering(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const fkMapping = otherField.relationFromFields
    ?.map((fk, idx) => `${fk}: record.${otherField.relationToFields?.at(idx)}`)
    .join(", ");

  writer.writeLine(`if (whereClause.${field.name})`).block(() => {
    writer
      .writeLine(`if (whereClause.${field.name}.every)`)
      .block(() => {
        writer
          .writeLine(`const violatingRecord = await this.client.${toCamelCase(field.type)}.findFirst(`)
          .block(() => {
            writer.writeLine(`where: { NOT: { ...whereClause.${field.name}.every }, ${fkMapping} },`);
          })
          .writeLine(`, { tx });`)
          .writeLine(`if (violatingRecord !== null) return null;`);
      })
      .writeLine(`if (whereClause.${field.name}.some)`)
      .block(() => {
        writer
          .writeLine(`const relatedRecords = await this.client.${toCamelCase(field.type)}.findMany(`)
          .block(() => {
            writer.writeLine(`where: { ...whereClause.${field.name}.some, ${fkMapping} },`);
          })
          .writeLine(`, { tx });`)
          .writeLine(`if (relatedRecords.length === 0) return null;`);
      })
      .writeLine(`if (whereClause.${field.name}.none)`)
      .block(() => {
        writer
          .writeLine(`const violatingRecord = await this.client.${toCamelCase(field.type)}.findFirst(`)
          .block(() => {
            writer.writeLine(`where: { ...whereClause.${field.name}.none, ${fkMapping} },`);
          })
          .writeLine(`, { tx });`)
          .writeLine(`if (violatingRecord !== null) return null;`);
      });
  });
}