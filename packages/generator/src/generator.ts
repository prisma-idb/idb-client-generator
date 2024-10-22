import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { logger } from "@prisma/internals";
import { DBSchema } from "idb";
import { GENERATOR_NAME } from "./constants";
import {
  convertToInterface,
  prismaToIDBTypeMap,
  writeFileSafely,
} from "./utils";
import path from "path";

const { version } = require("../package.json");

generatorHandler({
  onManifest() {
    logger.info(`${GENERATOR_NAME}:Registered`);
    return {
      version,
      defaultOutput: "../generated",
      prettyName: GENERATOR_NAME,
    };
  },
  onGenerate: async (options: GeneratorOptions) => {
    const schema: DBSchema = {};

    options.dmmf.datamodel.models.forEach(async (model) => {
      const key = model.fields.find(({ isId }) => isId);
      if (!key) throw new Error(`No id field found for model: ${model.name}`);

      const mappedKeyType = prismaToIDBTypeMap.get(key.type);
      if (!mappedKeyType) {
        throw new Error(`Prisma type ${key.type} is not yet supported`);
      }

      const value: Record<string, string> = {};
      model.fields.forEach((field) => {
        if (field.kind === "object") return;

        const mappedType = prismaToIDBTypeMap.get(field.type);
        if (!mappedType) {
          throw new Error(`Prisma type ${field.type} is not yet supported`);
        }

        value[field.name] = mappedType;
      });

      schema[model.name] = { key: mappedKeyType, value };
    });

    const tsTypes = convertToInterface(schema);
    const writeLocation = path.join(
      options.generator.output?.value!,
      `prisma-idb-types.ts`
    );

    await writeFileSafely(writeLocation, tsTypes);
  },
});
