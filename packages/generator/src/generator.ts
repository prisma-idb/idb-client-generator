import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { version } from "../package.json";
import { createBatchProcessorFile } from "./fileCreators/batch-processor/create";
import { createIDBInterfaceFile } from "./fileCreators/idb-interface/create";
import { createUtilsFile } from "./fileCreators/idb-utils/create";
import { createPrismaIDBClientFile } from "./fileCreators/prisma-idb-client/create";
import { writeCodeFile, writePrismaSchemaFile } from "./helpers/fileWriting";
import { createApplyPullFile } from "./fileCreators/apply-pull/create";
import { parseGeneratorConfig } from "./helpers/parseGeneratorConfig";
import { createValidatorsFile } from "./fileCreators/validators/create";
import { createEnumsFile } from "./fileCreators/enums/create";
import { spawnSync } from "child_process";
import { createScopedSchemaFile } from "./fileCreators/scoped-schema/create";
import path from "path";

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: "../generated",
    };
  },

  onGenerate: async (options: GeneratorOptions) => {
    const outputPath = options.generator.output?.value as string;
    let { prismaClientImport, outboxSync, outboxModelName, filteredModels, exportEnums, rootModel } =
      parseGeneratorConfig(options);

    if (outboxSync) {
      if (!prismaClientImport) {
        throw new Error("Prisma Client import path is required when Outbox Sync is enabled.");
      }

      await writeCodeFile("validators.ts", outputPath, (writer) => {
        createValidatorsFile(writer, filteredModels, options.dmmf.datamodel.enums);
      });

      await writeCodeFile("server/batch-processor.ts", outputPath, (writer) => {
        createBatchProcessorFile(writer, filteredModels, prismaClientImport, rootModel!);
      });

      await writeCodeFile("client/apply-pull.ts", outputPath, (writer) => {
        createApplyPullFile(writer, filteredModels);
      });

      await writePrismaSchemaFile("client/scoped-schema.prisma", outputPath, (writer) => {
        createScopedSchemaFile(writer, filteredModels, options.dmmf.datamodel.enums);
      });

      const result = spawnSync(
        "prisma",
        ["generate", "--schema", path.join(outputPath, "client/scoped-schema.prisma")],
        { stdio: ["inherit"] },
      );

      if (result.status !== 0) {
        throw new Error(
          `@prisma-idb/idb-client-generator: Failed to generate scoped Prisma Client.\n${result.stderr.toString()}`,
        );
      }

      prismaClientImport = "./generated/client";
    }

    await writeCodeFile("client/prisma-idb-client.ts", outputPath, (writer) => {
      createPrismaIDBClientFile(writer, filteredModels, prismaClientImport, outboxSync, outboxModelName);
    });

    await writeCodeFile("client/idb-interface.ts", outputPath, (writer) => {
      createIDBInterfaceFile(writer, filteredModels, prismaClientImport, outboxSync, outboxModelName);
    });

    await writeCodeFile("client/idb-utils.ts", outputPath, (writer) => {
      createUtilsFile(writer, filteredModels, prismaClientImport, outboxSync);
    });

    if (exportEnums) {
      const enums = options.dmmf.datamodel.enums;
      if (enums.length > 0) {
        await writeCodeFile("enums.ts", outputPath, (writer) => {
          createEnumsFile(writer, enums);
        });
      }
    }
  },
});
