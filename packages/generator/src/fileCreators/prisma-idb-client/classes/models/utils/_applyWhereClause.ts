import type { Field, Model } from "src/fileCreators/types";
import { toCamelCase } from "../../../../../helpers/utils";
import { ClassDeclaration, CodeBlockWriter, Scope } from "ts-morph";

export function addApplyWhereClause(modelClass: ClassDeclaration, model: Model, models: readonly Model[]) {
  modelClass.addMethod({
    name: "_applyWhereClause",
    scope: Scope.Private,
    isAsync: true,
    typeParameters: [
      { name: "W", constraint: `Prisma.Args<Prisma.${model.name}Delegate, 'findFirstOrThrow'>['where']` },
      { name: "R", constraint: `Prisma.Result<Prisma.${model.name}Delegate, object, 'findFirstOrThrow'>` },
    ],
    parameters: [
      { name: "records", type: `R[]` },
      { name: "whereClause", type: "W" },
      { name: "tx", type: "IDBUtils.TransactionType" },
    ],
    returnType: `Promise<R[]>`,
    statements: (writer) => {
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
        .writeLine(`))).filter((result) => result !== null);;`);
    },
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
  if (stringFields.length === 0) return;
  writer
    .writeLine(`const stringFields = ${JSON.stringify(stringFields)} as const;`)
    .writeLine(`for (const field of stringFields)`)
    .block(() => {
      writer.writeLine(`if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;`);
    });
}

function addNumberFiltering(writer: CodeBlockWriter, model: Model) {
  const numberFields = model.fields
    .filter((field) => (field.type === "Int" || field.type === "Float") && !field.isList)
    .map(({ name }) => name);

  if (numberFields.length === 0) return;
  writer
    .writeLine(`const numberFields = ${JSON.stringify(numberFields)} as const;`)
    .writeLine(`for (const field of numberFields)`)
    .block(() => {
      writer.writeLine(`if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;`);
    });
}

function addBigIntFiltering(writer: CodeBlockWriter, model: Model) {
  const numberFields = model.fields.filter((field) => field.type === "BigInt" && !field.isList).map(({ name }) => name);

  if (numberFields.length === 0) return;
  writer
    .writeLine(`const bigIntFields = ${JSON.stringify(numberFields)} as const;`)
    .writeLine(`for (const field of bigIntFields)`)
    .block(() => {
      writer.writeLine(`if (!IDBUtils.whereBigIntFilter(record, field, whereClause[field])) return null;`);
    });
}

function addBoolFiltering(writer: CodeBlockWriter, model: Model) {
  const booleanFields = model.fields
    .filter((field) => field.type === "Boolean" && !field.isList)
    .map(({ name }) => name);

  if (booleanFields.length === 0) return;
  writer
    .writeLine(`const booleanFields = ${JSON.stringify(booleanFields)} as const;`)
    .writeLine(`for (const field of booleanFields)`)
    .block(() => {
      writer.writeLine(`if (!IDBUtils.whereBoolFilter(record, field, whereClause[field])) return null;`);
    });
}

function addBytesFiltering(writer: CodeBlockWriter, model: Model) {
  const bytesFields = model.fields.filter((field) => field.type === "Bytes" && !field.isList).map(({ name }) => name);

  if (bytesFields.length === 0) return;
  writer
    .writeLine(`const bytesFields = ${JSON.stringify(bytesFields)} as const;`)
    .writeLine(`for (const field of bytesFields)`)
    .block(() => {
      writer.writeLine(`if (!IDBUtils.whereBytesFilter(record, field, whereClause[field])) return null;`);
    });
}

function addDateTimeFiltering(writer: CodeBlockWriter, model: Model) {
  const dateTimeFields = model.fields
    .filter((field) => field.type === "DateTime" && !field.isList)
    .map(({ name }) => name);

  if (dateTimeFields.length === 0) return;
  writer
    .writeLine(`const dateTimeFields = ${JSON.stringify(dateTimeFields)} as const;`)
    .writeLine(`for (const field of dateTimeFields)`)
    .block(() => {
      writer.writeLine(`if (!IDBUtils.whereDateTimeFilter(record, field, whereClause[field])) return null;`);
    });
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

function addOneToOneMetaOnFieldFiltering(writer: CodeBlockWriter, field: Field) {
  const fkName = field.relationFromFields?.at(0);
  const relationPk = field.relationToFields?.at(0);

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
          `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ...is, ${relationPk}: record.${fkName} } }, tx)`,
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
          `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ...isNot, ${relationPk}: record.${fkName} } }, tx)`,
        )
        .writeLine(`if (relatedRecord) return null;`);
    });

    writer.writeLine(`if (Object.keys(rest).length)`).block(() => {
      writer
        .conditionalWriteLine(!field.isRequired, () => `if (record.${fkName} === null) return null;`)
        .writeLine(
          `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ...whereClause.${field.name}, ${relationPk}: record.${fkName} } }, tx);`,
        )
        .writeLine(`if (!relatedRecord) return null;`);
    });
  });
}

function addOneToOneMetaOnOtherFieldFiltering(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const fkName = otherField.relationFromFields?.at(0);
  const relationPk = otherField.relationToFields?.at(0);

  if (!field.isRequired) {
    writer.writeLine(`if (whereClause.${field.name} === null)`).block(() => {
      writer
        .writeLine(
          `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ${fkName}: record.${relationPk} } }, tx)`,
        )
        .writeLine(`if (relatedRecord) return null;`);
    });
  }

  writer.writeLine(`if (whereClause.${field.name})`).block(() => {
    writer.writeLine(`const { is, isNot, ...rest } = whereClause.${field.name}`);
    if (!field.isRequired) {
      writer.writeLine(`if (is === null)`).block(() => {
        writer
          .writeLine(
            `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ${fkName}: record.${relationPk} } }, tx)`,
          )
          .writeLine(`if (relatedRecord) return null;`);
      });
    }
    writer.writeLine(`if (is !== null && is !== undefined)`).block(() => {
      writer
        .writeLine(
          `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ...is, ${fkName}: record.${relationPk} } }, tx)`,
        )
        .writeLine(`if (!relatedRecord) return null;`);
    });

    if (!field.isRequired) {
      writer.writeLine(`if (isNot === null)`).block(() => {
        writer
          .writeLine(
            `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ${fkName}: record.${relationPk} } }, tx)`,
          )
          .writeLine(`if (!relatedRecord) return null;`);
      });
    }
    writer.writeLine(`if (isNot !== null && isNot !== undefined)`).block(() => {
      writer
        .writeLine(
          `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ...isNot, ${fkName}: record.${relationPk} } }, tx)`,
        )
        .writeLine(`if (relatedRecord) return null;`);
    });

    writer.writeLine(`if (Object.keys(rest).length)`).block(() => {
      writer
        .conditionalWriteLine(!field.isRequired, () => `if (record.${relationPk} === null) return null;`)
        .writeLine(
          `const relatedRecord = await this.client.${toCamelCase(field.type)}.findFirst({ where: { ...whereClause.${field.name}, ${fkName}: record.${relationPk} } }, tx);`,
        )
        .writeLine(`if (!relatedRecord) return null;`);
    });
  });
}

function addOneToManyFiltering(writer: CodeBlockWriter, field: Field, otherField: Field) {
  const fkName = otherField.relationFromFields?.at(0);
  const relationPk = otherField.relationToFields?.at(0);

  writer.writeLine(`if (whereClause.${field.name})`).block(() => {
    writer
      .writeLine(`if (whereClause.${field.name}.every)`)
      .block(() => {
        writer
          .writeLine(`const violatingRecord = await this.client.${toCamelCase(field.type)}.findFirst(`)
          .block(() => {
            writer.writeLine(
              `where: { NOT: { ...whereClause.${field.name}.every }, ${fkName}: record.${relationPk} }, tx`,
            );
          })
          .writeLine(`);`)
          .writeLine(`if (violatingRecord !== null) return null;`);
      })
      .writeLine(`if (whereClause.${field.name}.some)`)
      .block(() => {
        writer
          .writeLine(`const relatedRecords = await this.client.${toCamelCase(field.type)}.findMany(`)
          .block(() => {
            writer.writeLine(`where: { ...whereClause.${field.name}.some, ${fkName}: record.${relationPk} }, tx`);
          })
          .writeLine(`);`)
          .writeLine(`if (relatedRecords.length === 0) return null;`);
      })
      .writeLine(`if (whereClause.${field.name}.none)`)
      .block(() => {
        writer
          .writeLine(`const violatingRecord = await this.client.${toCamelCase(field.type)}.findFirst(`)
          .block(() => {
            writer.writeLine(`where: { ...whereClause.${field.name}.none, ${fkName}: record.${relationPk} }, tx`);
          })
          .writeLine(`);`)
          .writeLine(`if (violatingRecord !== null) return null;`);
      });
  });
}
