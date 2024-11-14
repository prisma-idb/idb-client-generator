import { DMMF } from "@prisma/generator-helper";
import { CodeBlockWriter, SourceFile } from "ts-morph";
import { getUniqueIdentifiers } from "../../helpers/utils";
import { Model } from "../types";

export function createIDBInterfaceFile(idbInterfaceFile: SourceFile, models: DMMF.Datamodel["models"]) {
  idbInterfaceFile.addImportDeclaration({ isTypeOnly: true, namedImports: ["DBSchema"], moduleSpecifier: "idb" });
  idbInterfaceFile.addImportDeclaration({ namespaceImport: "Prisma", moduleSpecifier: "@prisma/client" });

  idbInterfaceFile.addInterface({
    name: "PrismaIDBSchema",
    extends: ["DBSchema"],
    isExported: true,
    properties: models.map((model) => ({
      name: model.name,
      type: (writer) => {
        writer.block(() => {
          writer
            .writeLine(`key: ${getUniqueIdentifiers(model)[0].keyPathType};`)
            .writeLine(`value: Prisma.${model.name};`);
          createUniqueFieldIndexes(writer, model);
        });
      },
    })),
  });
}

function createUniqueFieldIndexes(writer: CodeBlockWriter, model: Model) {
  const nonKeyUniqueIdentifiers = getUniqueIdentifiers(model).slice(1);
  if (nonKeyUniqueIdentifiers.length === 0) return;

  writer.writeLine("indexes: ").block(() => {
    nonKeyUniqueIdentifiers.forEach(({ name, keyPathType }) => {
      writer.writeLine(`${name}Index: ${keyPathType}`);
    });
  });
}
