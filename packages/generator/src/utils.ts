import { DBSchema } from "idb";
import fs from "fs";
import path from "path";
import prettier from "prettier";

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
    })
  );
};

export const prismaToIDBTypeMap = new Map([
  ["String", "string"],
  ["Int", "number"],
  ["Float", "number"],
  ["Boolean", "boolean"],
  ["DateTime", "Date"],
]);

export function convertToInterface(schema: DBSchema): string {
  let result = `import type { DBSchema } from "idb";\n\n`;
  result += `export interface PrismaIDBSchema extends DBSchema {\n`;

  for (const modelName in schema) {
    const model = schema[modelName];
    result += `  ${modelName.toLowerCase()}: {\n`;
    result += `    key: ${model.key};\n`;

    result += `    value: {\n`;
    for (const field in model.value) {
      result += `      ${field}: ${model.value[field]};\n`;
    }
    result += `    };\n`;
  }
  result += `  };\n`;

  result += `}\n`;
  return result;
}

export const writeFileSafely = async (writeLocation: string, content: any) => {
  fs.mkdirSync(path.dirname(writeLocation), {
    recursive: true,
  });

  fs.writeFileSync(writeLocation, await formatFile(content));
};
