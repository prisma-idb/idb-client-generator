import { DMMF } from "@prisma/generator-helper";
import { SourceFile, VariableDeclarationKind } from "ts-morph";
import { addClientClass } from "./classes/PrismaIDBClient";
import { addBaseModelClass } from "./classes/BaseIDBModelClass";
import { addIDBModelClass } from "./classes/models/IDBModelClass";
import type { Model } from "../types";

function addImports(file: SourceFile, models: readonly Model[]) {
  file.addImportDeclaration({
    moduleSpecifier: "idb",
    namedImports: ["openDB"],
    trailingTrivia: (writer) => writer.writeLine("/* eslint-disable @typescript-eslint/no-unused-vars */"),
  });
  file.addImportDeclaration({
    moduleSpecifier: "idb",
    namedImports: ["IDBPDatabase", "IDBPTransaction", "StoreNames"],
    isTypeOnly: true,
  });
  file.addImportDeclaration({ moduleSpecifier: "@prisma/client", namedImports: ["Prisma"], isTypeOnly: true });

  file.addImportDeclaration({ moduleSpecifier: "./idb-utils", namespaceImport: "IDBUtils" });
  file.addImportDeclaration({
    moduleSpecifier: "./idb-interface",
    namedImports: ["PrismaIDBSchema"],
    isTypeOnly: true,
  });

  const cuidFieldExists = models
    .flatMap((model) => model.fields)
    .some((field) => typeof field.default === "object" && "name" in field.default && field.default.name == "cuid");
  if (cuidFieldExists) {
    file.addImportDeclaration({
      moduleSpecifier: "@paralleldrive/cuid2",
      namedImports: ["createId"],
    });
  }
}

function addVersionDeclaration(file: SourceFile) {
  file.addVariableStatement({
    declarationKind: VariableDeclarationKind.Const,
    declarations: [{ name: "IDB_VERSION", initializer: "1" }],
  });
}

export function createPrismaIDBClientFile(idbClientFile: SourceFile, models: DMMF.Datamodel["models"]) {
  addImports(idbClientFile, models);
  addVersionDeclaration(idbClientFile);
  addClientClass(idbClientFile, models);
  addBaseModelClass(idbClientFile);
  models.forEach((model) => addIDBModelClass(idbClientFile, model, models));
}
