import type { Model } from "src/fileCreators/types";
import { CodeBlockWriter } from "ts-morph";
import { toCamelCase } from "../../../../../helpers/utils";

export function addResolveSortOrder(writer: CodeBlockWriter, model: Model) {
  writer
    .writeLine(`_resolveSortOrder(`)
    .writeLine(`orderByInput: Prisma.${model.name}OrderByWithRelationInput`)
    .writeLine(`): Prisma.SortOrder | { sort: Prisma.SortOrder, nulls?: 'first' | 'last' }`)
    .block(() => {
      addScalarResolution(writer, model);
      addOneToOneRelationResolution(writer, model);
      addOneToManyRelationResolution(writer, model);
      writer.writeLine(`throw new Error("No field in orderBy clause");`);
    });
}

function addScalarResolution(writer: CodeBlockWriter, model: Model) {
  const scalarFields = model.fields.filter(({ kind }) => kind !== "object").map(({ name }) => name);
  if (!scalarFields.length) return;

  writer
    .writeLine(`const scalarFields = ${JSON.stringify(scalarFields)} as const;`)
    .writeLine(`for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];`);
}

function addOneToOneRelationResolution(writer: CodeBlockWriter, model: Model) {
  const relationFields = model.fields.filter(({ kind, isList }) => kind === "object" && !isList);
  for (const field of relationFields) {
    writer.writeLine(`if (orderByInput.${field.name})`).block(() => {
      writer.writeLine(`return this.client.${toCamelCase(field.type)}._resolveSortOrder(orderByInput.${field.name});`);
    });
  }
}

function addOneToManyRelationResolution(writer: CodeBlockWriter, model: Model) {
  const relationFields = model.fields.filter(({ kind, isList }) => kind === "object" && isList);
  for (const field of relationFields) {
    writer.writeLine(`if (orderByInput.${field.name}?._count)`).block(() => {
      writer.writeLine(`return orderByInput.${field.name}._count;`);
    });
  }
}
