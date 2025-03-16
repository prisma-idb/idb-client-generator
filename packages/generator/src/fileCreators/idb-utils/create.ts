import { SourceFile, VariableDeclarationKind } from "ts-morph";
import { Model } from "../types";
import { addGenericComparator } from "./comparator/genericComparator";
import { addBigIntFilter } from "./filters/BigIntFilter";
import { addBoolFilter } from "./filters/BoolFilter";
import { addBytesFilter } from "./filters/BytesFilter";
import { addDateTimeFilter } from "./filters/DateTimeFilter";
import { addNumberFilter } from "./filters/NumberFilter";
import { addStringFilter } from "./filters/StringFilter";
import { addBigIntListFilter } from "./listFilters/BigIntListFilter";
import { addBooleanListFilter } from "./listFilters/BooleanListFilter";
import { addBytesListFilter } from "./listFilters/BytesListFilter";
import { addDateTimeListFilter } from "./listFilters/DateTimeListFilter";
import { addNumberListFilter } from "./listFilters/NumberListFilter";
import { addStringListFilter } from "./listFilters/StringListFilter";
import { addApplyLogicalFilters } from "./logicalFilters/applyLogicalFilters";
import { addIntersectArraysByNestedKeyFunction } from "./logicalFilters/intersectArraysByNestedKey";
import { addRemoveDuplicatesByKeyPath } from "./logicalFilters/removeDuplicatesByKeyPath";
import { addBigIntUpdateHandler } from "./updateHandlers/BigIntHandler";
import { addBooleanUpdateHandler } from "./updateHandlers/BooleanHandler";
import { addBytesUpdateHandler } from "./updateHandlers/BytesHandler";
import { addDateTimeUpdateHandler } from "./updateHandlers/DateTimeHandler";
import { addFloatUpdateHandler } from "./updateHandlers/FloatHandler";
import { addIntUpdateHandler } from "./updateHandlers/IntHandler";
import { addScalarListUpdateHandler } from "./updateHandlers/ScalarListHandler";
import { addStringUpdateHandler } from "./updateHandlers/StringHandler";
import { addEnumUpdateHandler } from "./updateHandlers/EnumHandler";

export function createUtilsFile(idbUtilsFile: SourceFile, models: readonly Model[]) {
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
    name: "ReadwriteTransactionType",
    type: `IDBPTransaction<PrismaIDBSchema, StoreNames<PrismaIDBSchema>[], "readwrite">;`,
  });
  idbUtilsFile.addTypeAlias({
    isExported: true,
    name: "ReadonlyTransactionType",
    type: `IDBPTransaction<PrismaIDBSchema, StoreNames<PrismaIDBSchema>[], "readonly">;`,
  });
  idbUtilsFile.addTypeAlias({
    isExported: true,
    name: "TransactionType",
    type: `ReadonlyTransactionType | ReadwriteTransactionType;`,
  });

  idbUtilsFile.addVariableStatement({
    declarations: [{ name: "LogicalParams", initializer: `["AND", "OR", "NOT"] as const` }],
    declarationKind: VariableDeclarationKind.Const,
    isExported: true,
  });

  addIntersectArraysByNestedKeyFunction(idbUtilsFile);
  addRemoveDuplicatesByKeyPath(idbUtilsFile);
  addApplyLogicalFilters(idbUtilsFile);

  addStringFilter(idbUtilsFile, models);
  addNumberFilter(idbUtilsFile, models);
  addBigIntFilter(idbUtilsFile, models);
  addBoolFilter(idbUtilsFile, models);
  addBytesFilter(idbUtilsFile, models);
  addDateTimeFilter(idbUtilsFile, models);

  addStringListFilter(idbUtilsFile, models);
  addNumberListFilter(idbUtilsFile, models);
  addBigIntListFilter(idbUtilsFile, models);
  addBooleanListFilter(idbUtilsFile, models);
  addBytesListFilter(idbUtilsFile, models);
  addDateTimeListFilter(idbUtilsFile, models);

  addStringUpdateHandler(idbUtilsFile, models);
  addBooleanUpdateHandler(idbUtilsFile, models);
  addDateTimeUpdateHandler(idbUtilsFile, models);
  addBytesUpdateHandler(idbUtilsFile, models);
  addIntUpdateHandler(idbUtilsFile, models);
  addBigIntUpdateHandler(idbUtilsFile, models);
  addFloatUpdateHandler(idbUtilsFile, models);
  addEnumUpdateHandler(idbUtilsFile, models);
  addScalarListUpdateHandler(idbUtilsFile, models);

  addGenericComparator(idbUtilsFile);
}
