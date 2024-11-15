export function convertToArray<T>(arg: T | T[]): T[] {
  return Array.isArray(arg) ? arg : [arg];
}

export type CreateTransactionType = IDBPTransaction<PrismaIDBSchema, StoreNames<PrismaIDBSchema>[], "readwrite">;
