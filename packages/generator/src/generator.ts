import { generatorHandler, GeneratorOptions } from "@prisma/generator-helper";
import path from "path";
import { Project, VariableDeclarationKind } from "ts-morph";
import { version } from "../package.json";
import { addBaseModelClass, addClientClass, addImports } from "./fileBaseFunctions";
import { addModelClass } from "./fileModelFunctions";
import { outputUtilsText } from "./outputUtils";
import { writeFileSafely } from "./utils";

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: "../generated",
    };
  },

  onGenerate: async (options: GeneratorOptions) => {
    const { models } = options.dmmf.datamodel;

    const project = new Project();
    const file = project.createSourceFile("prisma-idb-client.ts", "", { overwrite: true });

    // TODO: update version numbers if schema changes
    file.addVariableStatement({
      declarationKind: VariableDeclarationKind.Const,
      declarations: [{ name: "IDB_VERSION", type: "number", initializer: "1" }],
    });

    addImports(file, models);
    addClientClass(file, models);
    addBaseModelClass(file);

    models.forEach((model) => addModelClass(file, model));

    const writeLocation = path.join(options.generator.output?.value as string, file.getBaseName());
    await writeFileSafely(writeLocation, file.getText());

    await writeFileSafely(path.join(options.generator.output?.value as string, "utils.ts"), outputUtilsText);
  },
});
