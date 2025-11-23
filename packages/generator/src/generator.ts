import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { Project } from "ts-morph";
import { version } from "../package.json";
import { createIDBInterfaceFile } from "./fileCreators/idb-interface/create";
import { createUtilsFile } from "./fileCreators/idb-utils/create";
import { createPrismaIDBClientFile } from "./fileCreators/prisma-idb-client/create";
import { writeCodeFile, writeSourceFile } from "./helpers/fileWriting";

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: "../generated",
    };
  },

  onGenerate: async (options: GeneratorOptions) => {
    const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { skipLibCheck: true } });
    const { models } = options.dmmf.datamodel;
    const outputPath = options.generator.output?.value as string;

    const generatorConfig = options.generator.config;
    const prismaClientImport = generatorConfig.prismaClientImport;
    if (typeof prismaClientImport !== "string") {
      throw new Error(
        `@prisma-idb/idb-client-generator requires an import path for the Prisma client to be specified.\n` +
          `If you have not provided an output value for the client generator, use "@prisma/client"` +
          `generator prismaIDB {` +
          `\tprovider           = "idb-client-generator"` +
          `\toutput             = "./prisma-idb"` +
          `\tprismaClientImport = "resolvable/path/to/prisma/client"`
      );
    }

    await writeCodeFile("prisma-idb-client.ts", outputPath, (writer) => {
      createPrismaIDBClientFile(writer, models, prismaClientImport);
    });

    await writeSourceFile(project, "idb-interface.ts", outputPath, (file) => {
      createIDBInterfaceFile(file, models, prismaClientImport);
    });

    await writeSourceFile(project, "idb-utils.ts", outputPath, (file) => {
      createUtilsFile(file, models, prismaClientImport);
    });
  },
});
