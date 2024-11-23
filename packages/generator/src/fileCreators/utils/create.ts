import { SourceFile } from "ts-morph";
import { addStringFilter } from "./filters/StringFilter";
import { addNumberFilter } from "./filters/NumberFilter";
import { addBigIntFilter } from "./filters/BigIntFilter";
import { addBoolFilter } from "./filters/BoolFilter";

export function createUtilsFile(idbUtilsFile: SourceFile) {
  idbUtilsFile.addImportDeclarations([
    { moduleSpecifier: "idb", isTypeOnly: true, namedImports: ["IDBPTransaction", "StoreNames"] },
    { moduleSpecifier: "./idb-interface", isTypeOnly: true, namedImports: ["PrismaIDBSchema"] },
    { moduleSpecifier: "@prisma/client", isTypeOnly: true, namedImports: ["Prisma"] },
  ]);

  idbUtilsFile.addFunction({
    name: "convertToArray",
    typeParameters: [{ name: "T" }],
    parameters: [{ name: "arg", type: "T | T[]" }],
    returnType: "T[]",
    isExported: true,
    statements: (writer) => writer.writeLine("return Array.isArray(arg) ? arg : [arg];"),
  });

  idbUtilsFile.addTypeAlias({
    isExported: true,
    name: "CreateTransactionType",
    type: `IDBPTransaction<PrismaIDBSchema, StoreNames<PrismaIDBSchema>[], "readwrite">;`,
  });

  addStringFilter(idbUtilsFile);
  addNumberFilter(idbUtilsFile);
  addBigIntFilter(idbUtilsFile);
  addBoolFilter(idbUtilsFile);
}
