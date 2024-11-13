import { DMMF } from "@prisma/generator-helper";
import { SourceFile } from "ts-morph";
import { prismaToJsTypes } from "./types";
import { generateIDBKey } from "./helpers/utils";

export function createInterfaceFile(idbInterfaceFile: SourceFile, models: DMMF.Datamodel["models"]) {
  idbInterfaceFile.addImportDeclaration({ isTypeOnly: true, namedImports: ["DBSchema"], moduleSpecifier: "idb" });
  idbInterfaceFile.addImportDeclaration({ namespaceImport: "Prisma", moduleSpecifier: "@prisma/client" });

  idbInterfaceFile.addInterface({
    name: "PrismaIDBSchema",
    extends: ["DBSchema"],
    isExported: true,
    properties: models.map((model) => ({
      name: model.name,
      type: (writer) => {
        const keyPath = JSON.parse(generateIDBKey(model)) as string[];
        const idbKeyPath = JSON.stringify(
          keyPath.map((keyFieldName) => {
            const keyField = model.fields.find(({ name }) => keyFieldName === name)!;
            const keyFieldJsType = prismaToJsTypes.get(keyField.type);
            if (!keyFieldJsType) throw new Error(`Key field type: ${keyField.type} is not supported`);
            return keyFieldJsType;
          }),
        ).replaceAll('"', "");

        writer.block(() => {
          writer
            .writeLine(`key: ${idbKeyPath}`)
            .writeLine(`value: Prisma.${model.name}`)
            .writeLine("indexes: { [s: string]: IDBValidKey }");
        });
      },
    })),
  });
}
