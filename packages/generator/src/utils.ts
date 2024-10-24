import { DBSchema } from "idb";
import fs from "fs";
import path from "path";
import prettier from "prettier";
import { DMMF } from "@prisma/generator-helper";

function toCamelCase(str: string): string {
  return str
    .replace(/[_\s-]+(.)?/g, (_, chr) => (chr ? chr.toUpperCase() : ""))
    .replace(/^(.)/, (match) => match.toLowerCase());
}

function toArrayString(arr: string[]): string {
  return `[ ${arr.join(", ")} ]`;
}

export const formatFile = (content: string): Promise<string> => {
  return new Promise((res, rej) =>
    prettier.resolveConfig(process.cwd()).then((options) => {
      if (!options) res(content);

      try {
        const formatted = prettier.format(content, {
          ...options,
          parser: "typescript",
        });

        res(formatted);
      } catch (error) {
        rej(error);
      }
    }),
  );
};

export const prismaToIDBTypeMap = new Map([
  ["String", "string"],
  ["Int", "number"],
  ["Float", "number"],
  ["Boolean", "boolean"],
  ["DateTime", "Date"],
]);

export function convertToInterface(schema: DBSchema, enumText: string): string {
  let result = `import type { DBSchema } from "idb";\n\n`;

  result += `${enumText};\n\n`;

  const modelsText = Object.keys(schema).map((modelName) => {
    const model = schema[modelName];
    const valuesText = Object.keys(model.value).map(
      (field) => `${field}: ${model.value[field]}`,
    );
    return `${toCamelCase(modelName)}: { key: ${model.key}; value: { ${valuesText.join(", ")} } }`;
  });

  result += `export interface PrismaIDBSchema extends DBSchema { ${modelsText.join(";")} }`;
  return result;
}

export function generateEnumObject({ name, values }: DMMF.DatamodelEnum) {
  const enumValues = values.map(({ name }) => `${name}:"${name}"`).join(",\n");
  return `export const ${name} = { \n${enumValues}\n } as const;\n\n`;
}

export function generateIDBKey(model: DMMF.Datamodel["models"][number]) {
  if (!model.primaryKey) {
    const idField = model.fields.find(({ isId }) => isId);
    if (!idField) {
      const uniqueField = model.fields.find(({ isUnique }) => isUnique)!;
      const uniqueFieldType = prismaToIDBTypeMap.get(uniqueField.type);
      if (!uniqueFieldType) {
        throw new Error(
          `prisma-idb error: Key type ${uniqueField.type} not yet supported`,
        );
      }
      return toArrayString([`${uniqueField.name}: ${uniqueFieldType}`]);
    }

    const idFieldType = prismaToIDBTypeMap.get(idField.type);
    if (!idFieldType) {
      throw new Error(
        `prisma-idb error: Key type ${idField.type} not yet supported`,
      );
    }
    return toArrayString([`${idField.name}: ${idFieldType}`]);
  }

  return toArrayString(
    model.primaryKey.fields.map((fieldName) => {
      const field = model.fields.find((field) => field.name === fieldName)!;
      const fieldType = prismaToIDBTypeMap.get(field.type);
      if (!fieldType) {
        throw new Error(
          `prisma-idb error: Key type ${field.type} not yet supported`,
        );
      }
      return `${field.name}: ${fieldType}`;
    }),
  );
}

export const writeFileSafely = async (writeLocation: string, content: any) => {
  fs.mkdirSync(path.dirname(writeLocation), {
    recursive: true,
  });

  fs.writeFileSync(writeLocation, await formatFile(content));
};
