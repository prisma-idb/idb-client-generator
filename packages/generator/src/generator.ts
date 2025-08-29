import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { version } from "../package.json";
import { externalConfigSchema } from "./config";
import { createIDBInterfaceFile } from "./fileCreators/idb-interface/create";
import { createUtilsFile } from "./fileCreators/idb-utils/create";
import { createPrismaIDBClientFile } from "./fileCreators/prisma-idb-client/create";
import { writeCodeFile } from "./helpers/fileWriting";

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
    const clientPath = options.otherGenerators.find((each) => each.provider.value === "prisma-client-js")!.output!
      .value!;

    const results = externalConfigSchema.safeParse(options.generator.config);
    if (!results.success) {
      throw new Error("Incorrect config provided. Please check the values you provided and try again.");
    }

    const config = results.data;

    await Promise.all([
      writeCodeFile("prisma-idb-client.ts", outputPath, (writer) => {
        createPrismaIDBClientFile(writer, models, clientPath, config);
      }),

      writeCodeFile("idb-interface.ts", outputPath, (writer) => {
        createIDBInterfaceFile(writer, models, clientPath);
      }),

      writeCodeFile("idb-utils.ts", outputPath, (writer) => {
        createUtilsFile(writer, models, clientPath);
      }),
    ]);
  },
});
