import { DMMF } from "@prisma/generator-helper";
import { SourceFile, VariableDeclarationKind } from "ts-morph";
import { addClientClass } from "./classes/PrismaIDBClient";

function addImports(file: SourceFile) {
  file.addImportDeclaration({ moduleSpecifier: "idb", namedImports: ["openDB"] });
  file.addImportDeclaration({ moduleSpecifier: "idb", namedImports: ["IDBPDatabase"], isTypeOnly: true });
  file.addImportDeclaration({ moduleSpecifier: "@prisma/client", namedImports: ["Prisma"], isTypeOnly: true });
  file.addImportDeclaration({
    moduleSpecifier: "./idb-interface",
    namedImports: ["PrismaIDBSchema"],
    isTypeOnly: true,
  });
}

function addVersionDeclaration(file: SourceFile) {
  file.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{ name: "IDB_VERSION", initializer: "1" }],
  });
}

export function createPrismaIDBClientFile(idbClientFile: SourceFile, models: DMMF.Datamodel["models"]) {
  addImports(idbClientFile);
  addVersionDeclaration(idbClientFile);
  addClientClass(idbClientFile, models);
}
