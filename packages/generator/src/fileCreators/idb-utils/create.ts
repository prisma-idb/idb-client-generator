import CodeBlockWriter from "code-block-writer";
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
import { addSyncWorkerCode } from "./syncWorker/create";
import { addBigIntUpdateHandler } from "./updateHandlers/BigIntHandler";
import { addBooleanUpdateHandler } from "./updateHandlers/BooleanHandler";
import { addBytesUpdateHandler } from "./updateHandlers/BytesHandler";
import { addDateTimeUpdateHandler } from "./updateHandlers/DateTimeHandler";
import { addEnumUpdateHandler } from "./updateHandlers/EnumHandler";
import { addFloatUpdateHandler } from "./updateHandlers/FloatHandler";
import { addIntUpdateHandler } from "./updateHandlers/IntHandler";
import { addScalarListUpdateHandler } from "./updateHandlers/ScalarListHandler";
import { addStringUpdateHandler } from "./updateHandlers/StringHandler";

export function createUtilsFile(writer: CodeBlockWriter, models: readonly Model[], prismaClientImport: string, outboxSync: boolean = false) {
  writer.writeLine(`import type { IDBPTransaction, StoreNames } from "idb";`);
  writer.writeLine(`import type { PrismaIDBSchema } from "./idb-interface";`);
  writer.writeLine(`import type { Prisma } from "${prismaClientImport}";`);
  writer.blankLine();

  writer.writeLine("export function convertToArray<T>(arg: T | T[]): T[]").block(() => {
    writer.writeLine("return Array.isArray(arg) ? arg : [arg];");
  });

  writer.writeLine(`export type ReadwriteTransactionType = IDBPTransaction<PrismaIDBSchema, StoreNames<PrismaIDBSchema>[], "readwrite">;`);
  writer.writeLine(`export type ReadonlyTransactionType = IDBPTransaction<PrismaIDBSchema, StoreNames<PrismaIDBSchema>[], "readonly">;`);
  writer.writeLine(`export type TransactionType = ReadonlyTransactionType | ReadwriteTransactionType;`);
  writer.blankLine();

  writer.writeLine(`export const LogicalParams = ["AND", "OR", "NOT"] as const;`);
  writer.blankLine();

  addIntersectArraysByNestedKeyFunction(writer);
  addRemoveDuplicatesByKeyPath(writer);
  addApplyLogicalFilters(writer);

  addStringFilter(writer, models);
  addNumberFilter(writer, models);
  addBigIntFilter(writer, models);
  addBoolFilter(writer, models);
  addBytesFilter(writer, models);
  addDateTimeFilter(writer, models);

  addStringListFilter(writer, models);
  addNumberListFilter(writer, models);
  addBigIntListFilter(writer, models);
  addBooleanListFilter(writer, models);
  addBytesListFilter(writer, models);
  addDateTimeListFilter(writer, models);

  addStringUpdateHandler(writer, models);
  addBooleanUpdateHandler(writer, models);
  addDateTimeUpdateHandler(writer, models);
  addBytesUpdateHandler(writer, models);
  addIntUpdateHandler(writer, models);
  addBigIntUpdateHandler(writer, models);
  addFloatUpdateHandler(writer, models);
  addEnumUpdateHandler(writer, models);
  addScalarListUpdateHandler(writer, models);

  addGenericComparator(writer);

  if (outboxSync) {
    addSyncWorkerCode(writer);
  }
}
