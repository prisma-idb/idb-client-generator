import { Model } from "../fileCreators/types";

export function toCamelCase(str: string): string {
  return str
    .replace(/[_\s-]+(.)?/g, (_, chr) => (chr ? chr.toUpperCase() : ""))
    .replace(/^(.)/, (match) => match.toLowerCase());
}

function createIdentifierTuple(fieldNames: readonly string[], model: Model) {
  return JSON.stringify(
    fieldNames.map((keyFieldName) => {
      const keyField = model.fields.find(({ name }) => keyFieldName === name)!;
      return `${keyField.name}: Prisma.${model.name}['${keyField.name}']`;
    }),
  ).replaceAll('"', "");
}

export function getUniqueIdentifiers(model: Model) {
  const uniqueIdentifiers: { name: string; keyPath: string; keyPathType: string }[] = [];

  if (model.primaryKey) {
    const name = model.primaryKey.name ?? model.primaryKey.fields.join("_");
    uniqueIdentifiers.push({
      name,
      keyPath: JSON.stringify(model.primaryKey.fields),
      keyPathType: createIdentifierTuple(model.primaryKey.fields, model),
    });
  }

  const idField = model.fields.find(({ isId }) => isId);
  if (idField) {
    uniqueIdentifiers.push({
      name: idField.name,
      keyPath: JSON.stringify([idField.name]),
      keyPathType: createIdentifierTuple([idField.name], model),
    });
  }

  const uniqueField = model.fields.filter(({ isUnique }) => isUnique);
  uniqueField.forEach((uniqueField) => {
    if (uniqueIdentifiers.some((identifier) => identifier.name === uniqueField.name)) return;
    uniqueIdentifiers.push({
      name: uniqueField.name,
      keyPath: JSON.stringify([uniqueField.name]),
      keyPathType: createIdentifierTuple([uniqueField.name], model),
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
  const allRequiredFieldsHaveDefaults = fieldsWithDefaultValue.length === model.fields.length - optionalFields.length;

  return { optionalFields, fieldsWithDefaultValue, allRequiredFieldsHaveDefaults, nonKeyUniqueFields, storeName };
}

export function parseStringBoolean(stringBoolean: string | string[] | undefined) {
  return stringBoolean === "true" ? true : stringBoolean === "false" ? false : undefined;
}

export function parseString(value: string | string[] | undefined, optionPropertyName: string) {
  if (Array.isArray(value)) {
    throw new Error(`Invalid "${optionPropertyName}" option value "${value}" provided for TypeGraphQL generator.`);
  }
  return value;
}

export function parseStringArray<TAllowedValue extends string>(
  stringArray: string | string[] | undefined,
  optionPropertyName: string,
  allowedValues?: readonly TAllowedValue[],
): TAllowedValue[] | undefined {
  if (!stringArray) {
    return undefined;
  }

  let parsedArray: string[];
  if (typeof stringArray === "string") {
    if (!stringArray.includes(",")) {
      throw new Error(`Invalid "${optionPropertyName}" value "${stringArray}" provided for TypeGraphQL generator.`);
    }
    parsedArray = stringArray.split(",").map((it) => it.trim());
  } else {
    parsedArray = stringArray;
  }

  if (allowedValues) {
    for (const option of parsedArray) {
      if (!allowedValues.includes(option as any)) {
        throw new Error(`Invalid "${optionPropertyName}" option value "${option}" provided for TypeGraphQL generator.`);
      }
    }
  }

  return parsedArray as TAllowedValue[];
}

export function parseStringEnum<TAllowedValue extends string>(
  stringEnum: string | string[] | undefined,
  optionPropertyName: string,
  allowedValues: readonly TAllowedValue[],
): TAllowedValue | undefined {
  if (!stringEnum) {
    return undefined;
  }
  if (!allowedValues.includes(stringEnum as any)) {
    throw new Error(`Invalid "${optionPropertyName}" option value "${stringEnum}" provided for TypeGraphQL generator.`);
  }
  return stringEnum as TAllowedValue;
}
