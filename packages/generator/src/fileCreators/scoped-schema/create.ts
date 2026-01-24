import CodeBlockWriter from "code-block-writer";
import { Field, Model } from "../types";
import { DMMF } from "@prisma/generator-helper";

export function createScopedSchemaFile(
  writer: CodeBlockWriter,
  filteredModels: readonly Model[],
  enums: readonly DMMF.DatamodelEnum[],
) {
  writerDatasourceAndClientGenerator(writer);
  writeModels(writer, filteredModels);
  writeEnums(writer, enums);
}

function writerDatasourceAndClientGenerator(writer: CodeBlockWriter) {
  writer
    .writeLine(`// This is a generated Prisma schema for the scoped database.`)
    .writeLine(`// It includes only the models that are synchronized with the client.`)
    .blankLine()
    .writeLine(`generator client {`)
    .indent(() => {
      writer.writeLine(`provider = "prisma-client"`).writeLine(`output   = "./generated"`);
    })
    .writeLine(`}`)
    .blankLine()
    .writeLine(`datasource db {`)
    .indent(() => {
      writer.writeLine(`provider = "postgresql"`);
    })
    .writeLine(`}`)
    .blankLine();
}

function writeModels(writer: CodeBlockWriter, filteredModels: readonly Model[]) {
  for (const model of filteredModels) {
    writer
      .writeLine(`model ${model.name} {`)
      .indent(() => {
        const filteredFields = getFilteredFields(model, filteredModels);
        writeFields(writer, filteredFields);
        writeUniqueFieldsAndIndexes(writer, model);
      })
      .writeLine(`}`)
      .blankLine();
  }
}

function getFilteredFields(model: Model, filteredModels: readonly Model[]) {
  const removedExcludedModelsRelationships = model.fields.filter(
    (field) => !isFieldRelationToUnsyncableModel(field, filteredModels),
  );

  return removedExcludedModelsRelationships;
}

function isFieldRelationToUnsyncableModel(
  field: { kind: string; type: string },
  filteredModels: readonly Model[],
): boolean {
  return field.kind === "object" && !filteredModels.some((m) => m.name === field.type);
}

function writeEnums(writer: CodeBlockWriter, enums: readonly DMMF.DatamodelEnum[]) {
  for (const enumDef of enums) {
    writer
      .writeLine(`enum ${enumDef.name} {`)
      .indent(() => {
        for (const value of enumDef.values) {
          writer.writeLine(value.name);
        }
      })
      .writeLine(`}`)
      .blankLine();
  }
}

function writeFields(writer: CodeBlockWriter, filteredFields: readonly Field[]) {
  for (const field of filteredFields) {
    writer.write(`${field.name}\t${field.type}`);

    if (field.isList) writer.write("[]");
    else if (!field.isRequired) writer.write("?");

    const attributes: string[] = [];
    if (field.isId) attributes.push("@id");
    if (field.isUnique && !field.isId) attributes.push("@unique");
    if (field.isUpdatedAt) attributes.push("@updatedAt");
    if (field.hasDefaultValue) attributes.push(`@default(${computeDefaultValueString(field.default)})`);
    if (field.relationName || field.relationFromFields?.length) attributes.push(computeRelationAttribute(field)!);
    if (attributes.length > 0) writer.write(`\t${attributes.join(" ")}`);

    writer.write("\n");
  }
}

function computeDefaultValueString(defaultValue: Field["default"]): string {
  if (Array.isArray(defaultValue)) {
    return `[${defaultValue.map((v) => JSON.stringify(v)).join(", ")}]`;
  } else if (typeof defaultValue !== "object") {
    return JSON.stringify(defaultValue);
  } else {
    const def = defaultValue as { name: string; args: string[] };
    return `${def.name}(${def.args.join(", ")})`;
  }
}

function computeRelationAttribute(field: Field): string {
  let relationAttribute = `@relation(`;
  if (field.relationName) relationAttribute += `"${field.relationName}"`;
  if (field.relationFromFields?.length === 0) return relationAttribute + `)`;

  relationAttribute += `, fields: [${field.relationFromFields?.join(", ")}], references: [${field.relationToFields?.join(", ")}])`;
  return relationAttribute;
}

function writeUniqueFieldsAndIndexes(writer: CodeBlockWriter, model: Model) {
  if (model.primaryKey) {
    const pkFields = model.primaryKey.fields;
    writer.writeLine(`@@id([${pkFields.join(", ")}])`);
  }

  for (const uniqueFieldSet of model.uniqueFields) {
    if (uniqueFieldSet.length > 1) {
      writer.writeLine(`@@unique([${uniqueFieldSet.join(", ")}])`);
    }
  }
}
