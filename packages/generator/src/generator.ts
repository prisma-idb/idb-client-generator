import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { version } from "../package.json";
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
        `}`
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
        `You can use either "include" or "exclude", but not both.`
      );
    }

    await writeCodeFile("client/prisma-idb-client.ts", outputPath, (writer) => {
      createPrismaIDBClientFile(writer, models, prismaClientImport, outboxSync, outboxModelName, include, exclude);
    });

    await writeCodeFile("client/idb-interface.ts", outputPath, (writer) => {
      createIDBInterfaceFile(writer, models, prismaClientImport, outboxSync, outboxModelName);
    });

    await writeCodeFile("client/idb-utils.ts", outputPath, (writer) => {
      createUtilsFile(writer, models, prismaClientImport, outboxSync);
    });
  },
});
