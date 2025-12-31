import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { version } from "../package.json";
import { createBatchProcessorFile } from "./fileCreators/batch-processor/create";
import { createIDBInterfaceFile } from "./fileCreators/idb-interface/create";
import { createUtilsFile } from "./fileCreators/idb-utils/create";
import { createPrismaIDBClientFile } from "./fileCreators/prisma-idb-client/create";
import { writeCodeFile } from "./helpers/fileWriting";
import { createApplyPullFile } from "./fileCreators/apply-pull/create";

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
    const prismaClientImport = generatorConfig.prismaClientImport;
    if (typeof prismaClientImport !== "string") {
      throw new Error(
        `@prisma-idb/idb-client-generator requires an import path for the Prisma client to be specified.\n` +
          `If you have not provided an output value for the client generator, use "@prisma/client"\n\n` +
          `generator prismaIDB {\n` +
          `\tprovider           = "idb-client-generator"\n` +
          `\toutput             = "./prisma-idb"\n` +
          `\tprismaClientImport = "resolvable/path/to/prisma/client"\n` +
          `}`,
      );
    }

    // Parse config options
    const outboxSync = generatorConfig.outboxSync === "true";
    const outboxModelName = (generatorConfig.outboxModelName as string) || "OutboxEvent";

    // Parse include/exclude - can be string or array
    let include: string[] = ["*"];
    let exclude: string[] = [];

    if (typeof generatorConfig.include === "string") {
      include = generatorConfig.include.split(",").map((s) => s.trim());
    } else if (Array.isArray(generatorConfig.include)) {
      include = generatorConfig.include;
    }

    if (typeof generatorConfig.exclude === "string") {
      exclude = generatorConfig.exclude.split(",").map((s) => s.trim());
    } else if (Array.isArray(generatorConfig.exclude)) {
      exclude = generatorConfig.exclude;
    }

    // Validate XOR: either include or exclude, not both
    if (include.length > 0 && include[0] !== "*" && exclude.length > 0) {
      throw new Error(
        `@prisma-idb/idb-client-generator: "include" and "exclude" are mutually exclusive (XOR).\n` +
          `You can use either "include" or "exclude", but not both.`,
      );
    }

    // Filter models based on include/exclude patterns
    const matchPattern = (name: string, pattern: string): boolean => {
      const globToRegex = (glob: string): RegExp => {
        const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
        const withWildcard = escaped.replace(/\\\*/g, ".*");
        return new RegExp(`^${withWildcard}$`);
      };
      return globToRegex(pattern).test(name);
    };

    const isIncluded = (modelName: string) => {
      if (include[0] !== "*") {
        return include.some((pattern) => matchPattern(modelName, pattern));
      }
      return !exclude.some((pattern) => matchPattern(modelName, pattern));
    };

    const filteredModels = models.filter((model) => isIncluded(model.name));

    const usePrismaZodGenerator = generatorConfig.usePrismaZodGenerator === "true";

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
        createBatchProcessorFile(writer, filteredModels, prismaClientImport, usePrismaZodGenerator);
      });

      await writeCodeFile("client/apply-remote-changes.ts", outputPath, (writer) => {
        createApplyPullFile(writer, filteredModels, prismaClientImport);
      });
    }
  },
});
