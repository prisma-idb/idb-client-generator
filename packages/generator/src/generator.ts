import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import path from "path";
import { Project, SourceFile, VariableDeclarationKind } from "ts-morph";
import { version } from "../package.json";
import { addBaseModelClass, addClientClass, addImports, addTypes } from "./fileBaseFunctions";
import { createInterfaceFile } from "./interfaceSchema";
import { outputUtilsText } from "./outputUtils";
import { writeFileSafely } from "./utils";

async function createAndWriteSourceFile(
  project: Project,
  filename: string,
  outputPath: string,
  callback: (file: SourceFile) => void,
) {
  const file = project.createSourceFile(filename, "", { overwrite: true });
  callback(file);
  const writeLocation = path.join(outputPath, file.getBaseName());
  await writeFileSafely(writeLocation, file.getText());
}

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: "../generated",
    };
  },

  onGenerate: async (options: GeneratorOptions) => {
    const project = new Project();
    const { models, enums } = options.dmmf.datamodel;

    const outputPath = options.generator.output?.value as string;

    createAndWriteSourceFile(project, "prisma-idb-client.ts", outputPath, (file) => {
      // TODO: update version numbers if schema changes
      file.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        declarations: [{ name: "IDB_VERSION", type: "number", initializer: "1" }],
      });

      addImports(file);
      addTypes(file, models);
      addClientClass(file, models);
      addBaseModelClass(file);
      file.organizeImports();
    });

    createAndWriteSourceFile(project, "idb-interface.ts", outputPath, (file) => {
      createInterfaceFile(file, models, enums);
    });

    createAndWriteSourceFile(project, "datamodel.ts", outputPath, (file) => {
      file.addImportDeclaration({
        isTypeOnly: true,
        moduleSpecifier: "@prisma/client/runtime/library",
        namedImports: ["DMMF"],
      });
      file.addVariableStatement({
        declarationKind: VariableDeclarationKind.Const,
        isExported: true,
        declarations: models.map((model) => ({
          name: model.name,
          type: "DMMF.Datamodel['models'][number]",
          initializer: JSON.stringify(model),
        })),
      });
    });

    await writeFileSafely(path.join(options.generator.output?.value as string, "utils.ts"), outputUtilsText);
  },
});
