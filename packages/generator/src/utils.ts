import { DBSchema } from "idb";
import fs from "fs";
import path from "path";
import prettier from "prettier";
import { DMMF } from "@prisma/generator-helper";

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

export function convertToInterface(
  schema: DBSchema,
  enumText: string,
  typeMapWithEnums: Map<string, string>,
): string {
  let result = `import type { DBSchema } from "idb";\n\n`;

  result += `${enumText};\n\n`;
  result += `export interface PrismaIDBSchema extends DBSchema {\n`;

  for (const modelName in schema) {
    const model = schema[modelName];
    result += `  ${modelName.toLowerCase()}: {\n`;
    result += `    key: ${model.key};\n`;

    result += `    value: {\n`;
    for (const field in model.value) {
      let fieldType = model.value[field];
      console.log(prismaToIDBTypeMap, typeMapWithEnums);
      if (
        !prismaToIDBTypeMap.get(fieldType) &&
        typeMapWithEnums.get(fieldType)
      ) {
        fieldType = `typeof ${fieldType}[keyof typeof ${fieldType}]`;
      }
      result += `      ${field}: ${fieldType};\n`;
    }
    result += `    };\n`;
  }
  result += `  };\n`;

  result += `}\n`;
  return result;
}

export function generateEnumObject({ name, values }: DMMF.DatamodelEnum) {
  const enumValues = values.map(({ name }) => `${name}:"${name}"`).join(",\n");
  return `export const ${name} = { \n${enumValues}\n } as const;\n\n`;
}

export const writeFileSafely = async (writeLocation: string, content: any) => {
  fs.mkdirSync(path.dirname(writeLocation), {
    recursive: true,
  });

  fs.writeFileSync(writeLocation, await formatFile(content));
};
