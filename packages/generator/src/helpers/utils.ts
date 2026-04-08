import { DMMF } from "@prisma/generator-helper";
import { Model } from "../fileCreators/types";

export type IndexIdentifier = { name: string; keyPath: string; keyPathType: string };

export function toCamelCase(str: string): string {
  return str
    .replace(/[_\s-]+(.)?/g, (_, chr) => (chr ? chr.toUpperCase() : ""))
    .replace(/^(.)/, (match) => match.toLowerCase());
}

function createIdentifierTuple(fieldNames: readonly string[], model: Model) {
  return JSON.stringify(
    fieldNames.map((keyFieldName) => {
      const keyField = model.fields.find(({ name }) => keyFieldName === name)!;
      const typeExpr = keyField.isRequired
        ? `Prisma.${model.name}['${keyField.name}']`
        : `NonNullable<Prisma.${model.name}['${keyField.name}']>`;
      return `${keyField.name}: ${typeExpr}`;
    })
  ).replaceAll('"', "");
}

const prismaToPrimitiveTypesMap = {
  Int: "number",
  Float: "number",
  String: "string",
  Boolean: "boolean",
  DateTime: "Date",
  Json: "Prisma.InputJsonValue",
  BigInt: "bigint",
  Decimal: "Prisma.Decimal",
  Bytes: "Uint8Array",
};

// IDBValidKey = number | string | Date | BufferSource | IDBValidKey[]
// These Prisma types map to valid IDB key types
const validIDBKeyPrismaTypes = new Set(["Int", "Float", "String", "DateTime", "Bytes"]);

/**
 * Returns the field names and their Prisma types that are used as IDB key fields
 * but have types not supported by IndexedDB's IDBValidKey constraint.
 */
export function getUnsupportedKeyFields(model: Model): { fieldName: string; fieldType: string; context: string }[] {
  const unsupported: { fieldName: string; fieldType: string; context: string }[] = [];

  const checkFields = (fieldNames: readonly string[], context: string) => {
    for (const fieldName of fieldNames) {
      const field = model.fields.find(({ name }) => name === fieldName);
      if (field && !validIDBKeyPrismaTypes.has(field.type)) {
        unsupported.push({ fieldName, fieldType: field.type, context });
      }
    }
  };

  // Check composite @@id
  if (model.primaryKey) {
    checkFields(model.primaryKey.fields, `@@id([${model.primaryKey.fields.join(", ")}])`);
  }

  // Check single @id
  const idField = model.fields.find(({ isId }) => isId);
  if (idField && !validIDBKeyPrismaTypes.has(idField.type)) {
    unsupported.push({ fieldName: idField.name, fieldType: idField.type, context: `@id` });
  }

  // Check single @unique fields
  for (const field of model.fields.filter(({ isUnique }) => isUnique)) {
    if (!validIDBKeyPrismaTypes.has(field.type)) {
      unsupported.push({ fieldName: field.name, fieldType: field.type, context: `@unique` });
    }
  }

  // Check composite @@unique
  for (const { fields } of model.uniqueIndexes) {
    checkFields(fields, `@@unique([${fields.join(", ")}])`);
  }

  return unsupported;
}

/**
 * Returns IndexedDB index identifiers for foreign key fields on a model.
 *
 * These indexes are auto-generated to speed up relation joins. Without them,
 * every `include` / relation traversal falls back to a full `getAll()` scan
 * followed by in-memory filtering — O(N) per parent record instead of O(log N).
 *
 * An FK index is only generated when:
 *  - The field holds the FK side of a relation (`relationFromFields` is non-empty)
 *  - All FK field types are valid IDB key types
 *  - The exact field set is not already covered by the primary key, a
 *    `@unique` / `@@unique` constraint, or an explicit `@@index`
 */
export function getForeignKeyIndexes(model: Model, datamodelIndexes: readonly DMMF.Index[]): IndexIdentifier[] {
  // Collect key-paths that are already indexed so we don't create duplicates.
  const alreadyIndexedKeyPaths = new Set<string>([
    ...getUniqueIdentifiers(model).map(({ keyPath }) => keyPath),
    ...getNonUniqueIndexes(model, datamodelIndexes).map(({ keyPath }) => keyPath),
  ]);

  // Collect existing index names to avoid name collisions.
  const existingIndexNames = new Set<string>([
    ...getUniqueIdentifiers(model).map(({ name }) => name),
    ...getNonUniqueIndexes(model, datamodelIndexes).map(({ name }) => name),
  ]);

  const result: IndexIdentifier[] = [];
  const seenKeyPaths = new Set<string>();

  for (const field of model.fields) {
    if (field.kind !== "object" || !field.relationFromFields?.length) continue;

    const fkFieldNames = field.relationFromFields;
    const keyPath = JSON.stringify(fkFieldNames);

    if (alreadyIndexedKeyPaths.has(keyPath)) continue;
    if (seenKeyPaths.has(keyPath)) continue;

    // Only index FK fields whose types are valid IDB key types.
    const hasInvalidType = fkFieldNames.some((fieldName) => {
      const f = model.fields.find(({ name }) => name === fieldName);
      return !f || !validIDBKeyPrismaTypes.has(f.type);
    });
    if (hasInvalidType) continue;

    seenKeyPaths.add(keyPath);

    // Derive a non-colliding name: start with the base name and append a numeric
    // suffix if needed.
    const baseName = fkFieldNames.join("_");
    let finalName = baseName;
    let suffix = 1;
    while (existingIndexNames.has(finalName)) {
      finalName = `${baseName}_${suffix}`;
      suffix++;
    }
    existingIndexNames.add(finalName);

    result.push({
      name: finalName,
      keyPath,
      keyPathType: createIdentifierTuple(fkFieldNames, model),
    });
  }

  return result;
}

/**
 * Returns non-unique indexes (@@index) for a model, skipping any that use
 * unsupported IDB key types. When `printLogs` is true, warnings are logged
 * for skipped indexes.
 */
export function getNonUniqueIndexes(
  model: Model,
  datamodelIndexes: readonly DMMF.Index[],
  printLogs = false
): IndexIdentifier[] {
  const modelIndexes = datamodelIndexes.filter((i) => i.model === model.name && i.type === "normal");
  const result: IndexIdentifier[] = [];

  for (const idx of modelIndexes) {
    const fieldNames = idx.fields.map((f) => f.name);
    const unsupportedField = fieldNames.find((fieldName) => {
      const field = model.fields.find(({ name }) => name === fieldName);
      return field && !validIDBKeyPrismaTypes.has(field.type);
    });
    if (unsupportedField) {
      if (printLogs) {
        const field = model.fields.find(({ name }) => name === unsupportedField)!;
        console.log(
          `@prisma-idb/idb-client-generator: Model "${model.name}" has @@index([${fieldNames.join(", ")}]) ` +
            `with field "${unsupportedField}" (${field.type}) which is not a valid IndexedDB key type. ` +
            `This index will be skipped.`
        );
      }
      continue;
    }

    const name = idx.name ?? fieldNames.join("_");
    result.push({
      name,
      keyPath: JSON.stringify(fieldNames),
      keyPathType: createIdentifierTuple(fieldNames, model),
    });
  }

  return result;
}

export function getUniqueIdentifiers(model: Model) {
  const uniqueIdentifiers: { name: string; keyPath: string; keyPathType: string; keyPathTypes: string[] }[] = [];

  if (model.primaryKey) {
    const name = model.primaryKey.name ?? model.primaryKey.fields.join("_");
    uniqueIdentifiers.push({
      name,
      keyPath: JSON.stringify(model.primaryKey.fields),
      keyPathType: createIdentifierTuple(model.primaryKey.fields, model),
      keyPathTypes: model.primaryKey.fields.map((fieldName) => {
        const field = model.fields.find(({ name }) => name === fieldName)!;
        return prismaToPrimitiveTypesMap[field.type as keyof typeof prismaToPrimitiveTypesMap];
      }),
    });
  }

  const idField = model.fields.find(({ isId }) => isId);
  if (idField) {
    uniqueIdentifiers.push({
      name: idField.name,
      keyPath: JSON.stringify([idField.name]),
      keyPathType: createIdentifierTuple([idField.name], model),
      keyPathTypes: [prismaToPrimitiveTypesMap[idField.type as keyof typeof prismaToPrimitiveTypesMap]],
    });
  }

  const uniqueField = model.fields.filter(({ isUnique }) => isUnique);
  uniqueField.forEach((uniqueField) => {
    if (uniqueIdentifiers.some((identifier) => identifier.name === uniqueField.name)) return;
    uniqueIdentifiers.push({
      name: uniqueField.name,
      keyPath: JSON.stringify([uniqueField.name]),
      keyPathType: createIdentifierTuple([uniqueField.name], model),
      keyPathTypes: [prismaToPrimitiveTypesMap[uniqueField.type as keyof typeof prismaToPrimitiveTypesMap]],
    });
  });

  const compositeUniqueFields = model.uniqueIndexes;
  compositeUniqueFields.forEach(({ name, fields }) => {
    name = name ?? fields.join("_");
    if (uniqueIdentifiers.some((identifier) => identifier.name === name)) return;
    uniqueIdentifiers.push({
      name,
      keyPath: JSON.stringify(fields),
      keyPathType: createIdentifierTuple(fields, model),
      keyPathTypes: fields.map((fieldName) => {
        const field = model.fields.find(({ name }) => name === fieldName)!;
        return prismaToPrimitiveTypesMap[field.type as keyof typeof prismaToPrimitiveTypesMap];
      }),
    });
  });

  if (uniqueIdentifiers.length === 0) throw new Error(`Unable to generate valid IDB key for ${model.name}`);
  return uniqueIdentifiers;
}

export function getModelFieldData(model: Model) {
  const keyPath = JSON.parse(getUniqueIdentifiers(model)[0].keyPath);
  const nonKeyUniqueFields = model.fields.filter(({ isUnique, name }) => isUnique && !keyPath.includes(name));
  const storeName = toCamelCase(model.name);

  const optionalFields = model.fields.filter((field) => !field.isRequired);
  const fieldsWithDefaultValue = model.fields.filter((field) => field.hasDefaultValue);
  const nonDataRequiredFields = model.fields.filter((field) => !field.isRequired || field.hasDefaultValue);
  const allRequiredFieldsHaveDefaults = model.fields.length === nonDataRequiredFields.length;

  return { optionalFields, fieldsWithDefaultValue, allRequiredFieldsHaveDefaults, nonKeyUniqueFields, storeName };
}
