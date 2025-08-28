import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { version } from "../package.json";
import { createIDBInterfaceFile } from "./fileCreators/idb-interface/create";
import { createUtilsFile } from "./fileCreators/idb-utils/create";
import { createPrismaIDBClientFile } from "./fileCreators/prisma-idb-client/create";
import { writeCodeFile } from "./helpers/fileWriting";
import { parseStringBoolean } from "./helpers/utils";

type ExternalGeneratorOptions = {
};

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: "../generated",
    };
  },

  onGenerate: async (options: GeneratorOptions) => {
    const { models } = options.dmmf.datamodel;
    const outputPath = options.generator.output?.value as string;

    const generatorConfig = options.generator.config;
    const externalConfig: ExternalGeneratorOptions = {
      
    };

    await Promise.all([
      writeCodeFile("prisma-idb-client.ts", outputPath, (writer) => {
        createPrismaIDBClientFile(writer, models);
      }),

      writeCodeFile("idb-interface.ts", outputPath, (writer) => {
        createIDBInterfaceFile(writer, models);
      }),

      writeCodeFile("idb-utils.ts", outputPath, (writer) => {
        createUtilsFile(writer, models);
      }),
    ]);
  },
});
