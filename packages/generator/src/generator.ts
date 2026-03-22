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
import { createClientIndexFile } from "./fileCreators/index/create-client-index";
import { createServerIndexFile } from "./fileCreators/index/create-server-index";
import { spawnSync } from "child_process";
import { createScopedSchemaFile } from "./fileCreators/scoped-schema/create";
import { generateMigrations } from "./fileCreators/migrations/create";
import { createSchemaHashFile } from "./fileCreators/idb-schema-hash/create";
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
    const {
      prismaClientImport,
      outboxSync,
      outboxModelName,
      versionMetaModelName,
      filteredModels,
      exportEnums,
      rootModel,
      dropDbOnSchemaVersionMismatch,
    } = parseGeneratorConfig(options);

    let scopedPrismaImport = prismaClientImport;

    if (outboxSync) {
      if (!scopedPrismaImport) {
        throw new Error("Prisma Client import path is required when Outbox Sync is enabled.");
      }

      await writeCodeFile("validators.ts", outputPath, (writer) => {
        createValidatorsFile(writer, { models: filteredModels, enums: options.dmmf.datamodel.enums });
      });

      await writeCodeFile("server/batch-processor.ts", outputPath, (writer) => {
        createBatchProcessorFile(writer, { models: filteredModels, prismaClientImport, rootModel: rootModel! });
      });

      await writeCodeFile("client/apply-pull.ts", outputPath, (writer) => {
        createApplyPullFile(writer, { models: filteredModels, versionMetaModelName });
      });

      await writePrismaSchemaFile("client/scoped-schema.prisma", outputPath, (writer) => {
        createScopedSchemaFile(writer, { filteredModels, enums: options.dmmf.datamodel.enums });
      });

      await writeCodeFile("server/index.ts", outputPath, (writer) => {
        createServerIndexFile(writer);
      });

      const result = spawnSync(
        "prisma",
        ["generate", "--schema", path.join(outputPath, "client/scoped-schema.prisma")],
        { stdio: ["inherit"] }
      );

      if (result.status !== 0) {
        throw new Error(
          `@prisma-idb/idb-client-generator: Failed to generate scoped Prisma Client.\n${result.stderr.toString()}`
        );
      }

      scopedPrismaImport = "./generated/client";
    }

    // === Generate migrations ===
    const migrationResult = await generateMigrations(
      options.schemaPath,
      outputPath,
      filteredModels,
      options.dmmf.datamodel.enums,
      outboxSync,
      outboxModelName,
      versionMetaModelName
    );

    const migrationInfo = {
      currentVersion: migrationResult.currentVersion,
      schemaHash: migrationResult.schemaHash,
      migrationFolderNames: migrationResult.migrationFolderNames,
      dropDbOnSchemaVersionMismatch,
    };

    // Always write idb-schema-hash.ts for hash-based drift detection
    await writeCodeFile("client/idb-schema-hash.ts", outputPath, (writer) => {
      createSchemaHashFile(writer, migrationResult.schemaHash);
    });

    await writeCodeFile("client/prisma-idb-client.ts", outputPath, (writer) => {
      createPrismaIDBClientFile(writer, {
        models: filteredModels,
        prismaClientImport: scopedPrismaImport,
        outboxSync,
        outboxModelName,
        versionMetaModelName,
        migrationInfo,
      });
    });

    await writeCodeFile("client/idb-interface.ts", outputPath, (writer) => {
      createIDBInterfaceFile(writer, {
        models: filteredModels,
        prismaClientImport: scopedPrismaImport,
        outboxSync,
        outboxModelName,
        versionMetaModelName,
        hasMigrations: true,
      });
    });

    await writeCodeFile("client/idb-utils.ts", outputPath, (writer) => {
      createUtilsFile(writer, { models: filteredModels, prismaClientImport: scopedPrismaImport, outboxSync });
    });

    await writeCodeFile("client/index.ts", outputPath, (writer) => {
      createClientIndexFile(writer, { outboxSync, hasMigrations: true });
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
