import { DMMF } from "@prisma/generator-helper";
import { SourceFile } from "ts-morph";
import { prismaToJsTypes } from "./types";
import { generateIDBKey } from "./utils";

export function createInterfaceFile(
  idbInterfaceFile: SourceFile,
  models: DMMF.Datamodel["models"],
  enums: DMMF.Datamodel["enums"],
) {
  idbInterfaceFile.addImportDeclaration({ isTypeOnly: true, namedImports: ["DBSchema"], moduleSpecifier: "idb" });
  if (enums.length > 0) {
    idbInterfaceFile.addImportDeclaration({
      isTypeOnly: true,
      namedImports: enums.map(({ name }) => name),
      moduleSpecifier: "@prisma/client",
    });
  }

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
        );

        writer.block(() => {
          writer.writeLine(`key: ${idbKeyPath}`).writeLine("value: ");
          writer.block(() => {
            model.fields.forEach((field) => {
              if (field.kind === "enum") {
                writer.writeLine(`${field.name}: typeof ${field.type}[keyof typeof ${field.type}]`);
              } else if (field.kind === "scalar") {
                writer.writeLine(`${field.name}: ${prismaToJsTypes.get(field.type)}`);
              }
            });
          });
        });
      },
    })),
  });
}
