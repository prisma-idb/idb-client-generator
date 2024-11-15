import type { IDBPTransaction, StoreNames } from "idb";
import type { PrismaIDBSchema } from "./idb-interface";

export function convertToArray<T>(arg: T | T[]): T[] {
  return Array.isArray(arg) ? arg : [arg];
}

export type CreateTransactionType = IDBPTransaction<PrismaIDBSchema, StoreNames<PrismaIDBSchema>[], "readwrite">;
