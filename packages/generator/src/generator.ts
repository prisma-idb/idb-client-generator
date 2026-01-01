import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { version } from "../package.json";
import { createBatchProcessorFile } from "./fileCreators/batch-processor/create";
import { createIDBInterfaceFile } from "./fileCreators/idb-interface/create";
import { createUtilsFile } from "./fileCreators/idb-utils/create";
import { createPrismaIDBClientFile } from "./fileCreators/prisma-idb-client/create";
import { writeCodeFile } from "./helpers/fileWriting";
import { createApplyPullFile } from "./fileCreators/apply-pull/create";
import { parseGeneratorConfig } from "./helpers/parseGeneratorConfig";

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: "../generated",
    };
  },

  onGenerate: async (options: GeneratorOptions) => {
    const outputPath = options.generator.output?.value as string;
    const { prismaClientImport, prismaSingletonImport, outboxSync, outboxModelName, filteredModels } =
      parseGeneratorConfig(options);

    await writeCodeFile("client/prisma-idb-client.ts", outputPath, (writer) => {
      createPrismaIDBClientFile(writer, filteredModels, prismaClientImport, outboxSync, outboxModelName);
    });

    await writeCodeFile("client/idb-interface.ts", outputPath, (writer) => {
      createIDBInterfaceFile(writer, filteredModels, prismaClientImport, outboxSync, outboxModelName);
    });

    await writeCodeFile("client/idb-utils.ts", outputPath, (writer) => {
      createUtilsFile(writer, filteredModels, prismaClientImport, outboxSync);
    });

    if (outboxSync) {
      await writeCodeFile("server/batch-processor.ts", outputPath, (writer) => {
        createBatchProcessorFile(writer, filteredModels, prismaClientImport, prismaSingletonImport);
      });

      await writeCodeFile("client/apply-remote-changes.ts", outputPath, (writer) => {
        createApplyPullFile(writer, filteredModels);
      });
    }
  },
});
