import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { Project } from "ts-morph";
import { version } from "../package.json";
import { createIDBInterfaceFile } from "./fileCreators/idb-interface/create";
import { createUtilsFile } from "./fileCreators/idb-utils/create";
import { createPrismaIDBClientFile } from "./fileCreators/prisma-idb-client/create";
import { writeCodeFile, writeSourceFile } from "./helpers/fileWriting";
// import { parseStringBoolean } from "./helpers/utils";

// type ExternalGeneratorOptions = {
//   singleFile?: boolean;
// };

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

    // const generatorConfig = options.generator.config;
    // const externalConfig: ExternalGeneratorOptions = {
    //   singleFile: parseStringBoolean(generatorConfig.singleFile),
    // };

    await writeCodeFile("prisma-idb-client.ts", outputPath, (writer) => {
      createPrismaIDBClientFile(writer, models);
    });

    await writeSourceFile(project, "idb-interface.ts", outputPath, (file) => {
      createIDBInterfaceFile(file, models);
    });

    await writeSourceFile(project, "idb-utils.ts", outputPath, (file) => {
      createUtilsFile(file, models);
    });
  },
});
