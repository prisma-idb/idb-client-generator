import type { Model } from "src/fileCreators/types";
import { CodeBlockWriter } from "ts-morph";
import { toCamelCase } from "../../../../../helpers/utils";

export function addResolveOrderByKey(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  writer
    .writeLine(`async _resolveOrderByKey(`)
    .writeLine(`record: Prisma.Result<Prisma.${model.name}Delegate, object, "findFirstOrThrow">,`)
    .writeLine(`orderByInput: Prisma.${model.name}OrderByWithRelationInput,`)
    .writeLine(`tx: IDBUtils.TransactionType): Promise<unknown>`)
    .block(() => {
      addScalarResolution(writer, model);
      addOneToOneResolution(writer, model, models);
      addOneToManyResolution(writer, model, models);
    });
}

function addScalarResolution(writer: CodeBlockWriter, model: Model) {
  const scalarFields = model.fields.filter(({ kind }) => kind !== "object").map(({ name }) => name);
  if (!scalarFields.length) return;

  writer
    .writeLine(`const scalarFields = ${JSON.stringify(scalarFields)} as const;`)
    .writeLine(`for (const field of scalarFields) if (orderByInput[field]) return record[field];`);
}

function addOneToOneResolution(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const oneToOneRelationFields = model.fields.filter(({ kind, isList }) => kind === "object" && !isList);
  for (const field of oneToOneRelationFields) {
    let otherRecordField: string, recordField: string;
    if (field.relationFromFields?.length) {
      otherRecordField = field.relationToFields!.at(0)!;
      recordField = field.relationFromFields!.at(0)!;
    } else {
      const otherField = models
        .flatMap(({ fields }) => fields)
        .find((_field) => _field !== field && _field.relationName === field.relationName)!;
      otherRecordField = otherField.relationFromFields!.at(0)!;
      recordField = otherField.relationToFields!.at(0)!;
    }

    const nestedRecordQuery = `await this.client.${toCamelCase(field.type)}.findFirstOrThrow({ where: { ${otherRecordField}: record.${recordField} } })`;
    let returnValue = `await this.client.${toCamelCase(field.type)}._resolveOrderByKey(${nestedRecordQuery}, orderByInput.${field.name}, tx);`;
    if (!field.isRequired) {
      returnValue = `record.${recordField} === null ? null : ` + returnValue;
    }

    writer.writeLine(`if (orderByInput.${field.name})`).block(() => {
      writer.writeLine(`return ${returnValue}`);
    });
  }
}

function addOneToManyResolution(writer: CodeBlockWriter, model: Model, models: readonly Model[]) {
  const oneToManyRelationFields = model.fields.filter(({ kind, isList }) => kind === "object" && isList);
  for (const field of oneToManyRelationFields) {
    const otherField = models
      .flatMap(({ fields }) => fields)
      .find((_field) => _field !== field && _field.relationName === field.relationName)!;

    const fkMapping = otherField
      .relationFromFields!.map((field, idx) => `${field}: record.${otherField.relationToFields?.at(idx)}`)
      .join(", ");

    writer.writeLine(`if (orderByInput.${field.name})`).block(() => {
      writer.writeLine(`return await this.client.${toCamelCase(field.type)}.count({ where: { ${fkMapping} } }, tx);`);
    });
  }
}
