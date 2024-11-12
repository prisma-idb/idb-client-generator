export const outputUtilsText = `
import type { Prisma } from "@prisma/client";
import type { DMMF } from "@prisma/client/runtime/library";
import type { ModelDelegate } from "./prisma-idb-client";

export type Model = DMMF.Datamodel["models"][number];

export function intersectArraysByNestedKey<T extends ModelDelegate, Q extends Prisma.Args<T, "findFirstOrThrow">>(
  arrays: Prisma.Result<T, Q, "findFirstOrThrow">[][],
  keyPath: string[],
): Prisma.Result<T, Q, "findFirstOrThrow">[] {
  return arrays.reduce((acc, array) =>
    acc.filter((item) =>
      array.some((el) =>
        keyPath.every(
          (key) =>
            el[key as keyof Prisma.Result<T, Q, "findFirstOrThrow">] ===
            item[key as keyof Prisma.Result<T, Q, "findFirstOrThrow">],
        ),
      ),
    ),
  );
}

export function getModelFieldData(model: Model) {
  const keyPath = JSON.parse(generateIDBKey(model));
  const nonKeyUniqueFields = model.fields.filter(({ isUnique, name }) => isUnique && !keyPath.includes(name));
  const storeName = toCamelCase(model.name);

  const optionalFields = model.fields.filter((field) => !field.isRequired);
  const fieldsWithDefaultValue = model.fields.filter((field) => field.hasDefaultValue);
  const allRequiredFieldsHaveDefaults = fieldsWithDefaultValue.length === model.fields.length - optionalFields.length;

  return { optionalFields, fieldsWithDefaultValue, allRequiredFieldsHaveDefaults, nonKeyUniqueFields, storeName };
}

export function toCamelCase(str: string): string {
  return str
    .replace(/[_\s-]+(.)?/g, (_, chr) => (chr ? chr.toUpperCase() : ""))
    .replace(/^(.)/, (match) => match.toLowerCase());
}

export function generateIDBKey(model: Model) {
  if (model.primaryKey) return JSON.stringify(model.primaryKey.fields);

  const idField = model.fields.find(({ isId }) => isId);
  if (idField) return JSON.stringify([idField.name]);

  const uniqueField = model.fields.find(({ isUnique }) => isUnique)!;
  return JSON.stringify([uniqueField.name]);
}

export function removeDuplicatesByKeyPath<T extends ModelDelegate, Q extends Prisma.Args<T, "findFirstOrThrow">>(
  array: Prisma.Result<T, Q, "findFirstOrThrow">[][],
  keyPath: string[],
): Prisma.Result<T, Q, "findFirstOrThrow">[] {
  const seen = new Set<string>();
  return array
    .flatMap((el) => el)
    .filter((item) => {
      const key = JSON.stringify(keyPath.map((key) => item[key as keyof Prisma.Result<T, Q, "findFirstOrThrow">]));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function isLogicalOperator(param: unknown) {
  return param === "AND" || param === "OR" || param === "NOT";
}

export function filterByWhereClause<T extends ModelDelegate, Q extends Prisma.Args<T, "findFirstOrThrow">>(
  records: Prisma.Result<T, Q, "findFirstOrThrow">[],
  keyPath: string[],
  whereClause: Prisma.Args<T, "findFirstOrThrow">["where"],
): Prisma.Result<T, Q, "findFirstOrThrow">[] {
  if (whereClause === undefined) return records;

  for (const [unsafeParam, value] of Object.entries(whereClause)) {
    const param = unsafeParam as keyof Prisma.Result<T, Q, "findFirstOrThrow">;
    if (value === undefined) continue;

    if (isLogicalOperator(param)) {
      const operands = Array.isArray(whereClause[param]) ? whereClause[param] : [whereClause[param]];

      if (param === "AND") {
        records = intersectArraysByNestedKey(
          operands.map((operandClause) => filterByWhereClause(records, keyPath, operandClause)),
          keyPath,
        );
      }

      if (param === "OR") {
        records = removeDuplicatesByKeyPath(
          operands.map((operandClause) => filterByWhereClause(records, keyPath, operandClause)),
          keyPath,
        );
      }

      if (param === "NOT") {
        const excludedRecords = removeDuplicatesByKeyPath(
          operands.map((operandClause) => filterByWhereClause(records, keyPath, operandClause)),
          keyPath,
        );
        records = records.filter(
          (item) =>
            !excludedRecords.some((excluded) =>
              keyPath.every(
                (key) =>
                  excluded[key as keyof Prisma.Result<T, Q, "findFirstOrThrow">] ===
                  item[key as keyof Prisma.Result<T, Q, "findFirstOrThrow">],
              ),
            ),
        );
      }

      records = records.filter((record) => record[param] === whereClause[param]);
    }
  }

  return records;
}

export const prismaToJsTypes = new Map([
  ["String", "string"],
  ["Boolean", "boolean"],
  ["Int", "number"],
  ["BigInt", "bigint"],
  ["Float", "number"],
  ["Decimal", "string"],
  ["DateTime", "Date"],
  ["Json", "object"],
  ["Bytes", "Buffer"],
  ["Unsupported", "unknown"],
] as const);
`;
