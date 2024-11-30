import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { Project } from "ts-morph";
import { version } from "../package.json";
import { createIDBInterfaceFile } from "./fileCreators/idb-interface/create";
import { createPrismaIDBClientFile } from "./fileCreators/prisma-idb-client/create";
import { createUtilsFile } from "./fileCreators/utils/create";
import { writeSourceFile } from "./helpers/fileWriting";

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: "../generated",
    };
  },

  onGenerate: async (options: GeneratorOptions) => {
    const project = new Project();
    const { models } = options.dmmf.datamodel;
    const outputPath = options.generator.output?.value as string;

    await writeSourceFile(project, "prisma-idb-client.ts", outputPath, (file) => {
      createPrismaIDBClientFile(file, models);
    });

    await writeSourceFile(project, "idb-interface.ts", outputPath, (file) => {
      createIDBInterfaceFile(file, models);
    });

    await writeSourceFile(project, "idb-utils.ts", outputPath, (file) => {
      createUtilsFile(file, models);
    });
  },
});
