import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import { Project, VariableDeclarationKind } from "ts-morph";
import { version } from "../package.json";
import { addBaseModelClass, addClientClass, addImports } from "./fileBaseFunctions";
import { createInterfaceFile } from "./interfaceSchema";
import { createAndWriteSourceFile } from "./helpers/fileWriting";

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

    createAndWriteSourceFile(project, "prisma-idb-client.ts", outputPath, (file) => {
      // TODO: update version numbers if schema changes
      file.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [{ name: "IDB_VERSION", type: "number", initializer: "1" }],
      });

      addImports(file);
      addClientClass(file, models);
      addBaseModelClass(file);
      file.organizeImports();
    });

    createAndWriteSourceFile(project, "idb-interface.ts", outputPath, (file) => {
      createInterfaceFile(file, models);
    });
  },
});
