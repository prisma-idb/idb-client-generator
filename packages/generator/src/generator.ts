import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { DBSchema } from "idb";
import path from "path";
import {
  convertToInterface,
  generateEnumObject,
  prismaToIDBTypeMap,
  writeFileSafely,
} from "./utils";

const { version } = require("../package.json");

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: "../generated",
    };
  },

  onGenerate: async (options: GeneratorOptions) => {
    const schema: DBSchema = {};
    let enumText = "";

    const enumMap = new Map(
      options.dmmf.datamodel.enums.map(({ name }) => [name, name]),
    );

    options.dmmf.datamodel.enums.forEach(async (enumField) => {
      enumText += generateEnumObject(enumField);
    });

    options.dmmf.datamodel.models.forEach((model) => {
      const key = model.fields.find(({ isId }) => isId);
      if (!key)
        throw new Error(
          `Error during PrismaIDB: No id field found for model: ${model.name}`,
        );

      const mappedKeyType = prismaToIDBTypeMap.get(key.type);
      if (!mappedKeyType) {
        throw new Error(
          `Error during PrismaIDB: Key of type ${key.type} is not yet supported`,
        );
      }

      const value: Record<string, string> = {};
      model.fields.forEach((field) => {
        if (field.kind === "object") return;

        const enumType = enumMap.get(field.type);
        if (enumType) {
          value[field.name] = `typeof ${enumType}[keyof typeof ${enumType}]`;
          return;
        }

        const mappedType = prismaToIDBTypeMap.get(field.type);
        if (mappedType) {
          value[field.name] = mappedType;
          return;
        }

        throw new Error(
          `Error during PrismaIDB: Prisma type ${field.type} is not yet supported`,
        );
      });

      schema[model.name] = { key: mappedKeyType, value };
    });

    const fileOutput = convertToInterface(schema, enumText);
    const writeLocation = path.join(
      options.generator.output?.value!,
      `prisma-idb-types.ts`,
    );

    await writeFileSafely(writeLocation, fileOutput);
  },
});
