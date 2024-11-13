import { DMMF } from "@prisma/generator-helper";
import { SourceFile } from "ts-morph";
import { generateIDBKey } from "../../helpers/utils";
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
          writer.writeLine(`key: ${getIDBKeyPath(model)};`).writeLine(`value: Prisma.${model.name};`);
        });
      },
    })),
  });
}

function getIDBKeyPath(model: Model) {
  const keyPath = JSON.parse(generateIDBKey(model)) as string[];
  return JSON.stringify(
    keyPath.map((keyFieldName) => {
      const keyField = model.fields.find(({ name }) => keyFieldName === name)!;
      return `${keyField.name}: Prisma.${model.name}['${keyField.name}']`;
    }),
  ).replaceAll('"', "");
}
