import { DMMF } from "@prisma/generator-helper";
import fs from "fs";
import path from "path";
import prettier from "prettier";

export function toCamelCase(str: string): string {
  return str
    .replace(/[_\s-]+(.)?/g, (_, chr) => (chr ? chr.toUpperCase() : ""))
    .replace(/^(.)/, (match) => match.toLowerCase());
}

export const formatFile = (content: string, filepath: string): Promise<string> => {
  return new Promise((res, rej) =>
    prettier.resolveConfig(filepath).then((options) => {
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

export function generateIDBKey(model: DMMF.Datamodel["models"][number]) {
  if (model.primaryKey) return JSON.stringify(model.primaryKey.fields);

  const idField = model.fields.find(({ isId }) => isId);
  if (idField) return JSON.stringify([idField.name]);

  const uniqueField = model.fields.find(({ isUnique }) => isUnique)!;
  return JSON.stringify([uniqueField.name]);
}

export function getNonKeyUniqueFields(model: DMMF.Datamodel["models"][number]) {
  const keyPath = JSON.parse(generateIDBKey(model));
  return model.fields.filter(({ isUnique, name }) => isUnique && !keyPath.includes(name));
}

export const writeFileSafely = async (writeLocation: string, content: string) => {
  fs.mkdirSync(path.dirname(writeLocation), {
    recursive: true,
  });

  fs.writeFileSync(writeLocation, await formatFile(content, writeLocation));
};
