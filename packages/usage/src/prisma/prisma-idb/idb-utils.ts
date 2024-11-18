import type { Prisma } from "@prisma/client";
import type { IDBPTransaction, StoreNames } from "idb";
import type { PrismaIDBSchema } from "./idb-interface";

export function convertToArray<T>(arg: T | T[]): T[] {
  return Array.isArray(arg) ? arg : [arg];
}

export type CreateTransactionType = IDBPTransaction<PrismaIDBSchema, StoreNames<PrismaIDBSchema>[], "readwrite">;

export function whereStringFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  stringFilter: Prisma.StringFilter<unknown> | Prisma.StringNullableFilter<unknown> | string | undefined | null,
): boolean {
  if (stringFilter === undefined) return true;

  const value = record[fieldName] as string | null;
  if (stringFilter === null || value === null) return value === null;

  if (typeof stringFilter === "string") {
    if (value !== stringFilter) return false;
  } else {
    if (stringFilter.equals === null) {
      if (value !== null) return false;
    }
    if (typeof stringFilter.equals === "string") {
      if (stringFilter.mode === "insensitive") {
        if (stringFilter.equals.toLowerCase() !== value.toLowerCase()) return false;
      } else {
        if (stringFilter.equals !== value) return false;
      }
    }
    if (stringFilter.not === null) {
      if (value === null) return false;
    }
    if (typeof stringFilter.not === "string") {
      if (stringFilter.mode === "insensitive") {
        if (stringFilter.not.toLowerCase() === value.toLowerCase()) return false;
      } else {
        if (stringFilter.not === value) return false;
      }
    }
    if (Array.isArray(stringFilter.in)) {
      if (stringFilter.mode === "insensitive") {
        if (!stringFilter.in.map((s) => s.toLowerCase()).includes(value.toLowerCase())) return false;
      } else {
        if (!stringFilter.in.includes(value)) return false;
      }
    }
    if (Array.isArray(stringFilter.notIn)) {
      if (stringFilter.mode === "insensitive") {
        if (stringFilter.notIn.map((s) => s.toLowerCase()).includes(value.toLowerCase())) return false;
      } else {
        if (stringFilter.notIn.includes(value)) return false;
      }
    }
    if (typeof stringFilter.lt === "string") {
      if (!(value < stringFilter.lt)) return false;
    }
    if (typeof stringFilter.lte === "string") {
      if (!(value <= stringFilter.lte)) return false;
    }
    if (typeof stringFilter.gt === "string") {
      if (!(value > stringFilter.gt)) return false;
    }
    if (typeof stringFilter.gte === "string") {
      if (!(value >= stringFilter.gte)) return false;
    }
    if (typeof stringFilter.contains === "string") {
      if (stringFilter.mode === "insensitive") {
        if (!value.toLowerCase().includes(stringFilter.contains.toLowerCase())) return false;
      } else {
        if (!value.includes(stringFilter.contains)) return false;
      }
    }
    if (typeof stringFilter.startsWith === "string") {
      if (stringFilter.mode === "insensitive") {
        if (!value.toLowerCase().startsWith(stringFilter.startsWith.toLowerCase())) return false;
      } else {
        if (!value.startsWith(stringFilter.startsWith)) return false;
      }
    }
    if (typeof stringFilter.endsWith === "string") {
      if (stringFilter.mode === "insensitive") {
        if (!value.toLowerCase().endsWith(stringFilter.endsWith.toLowerCase())) return false;
      } else {
        if (!value.endsWith(stringFilter.endsWith)) return false;
      }
    }
  }
  return true;
}

export function whereIntFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  intFilter: Prisma.NestedIntNullableFilter<unknown> | number | undefined | null,
): boolean {
  if (intFilter === undefined) return true;

  const value = record[fieldName] as number | null;
  if (intFilter === null || value === null) return value === null;

  if (typeof intFilter === "number") {
    if (value !== intFilter) return false;
  } else {
    if (intFilter.equals === null) {
      if (value !== null) return false;
    }
    if (typeof intFilter.equals === "number") {
      if (intFilter.equals !== value) return false;
    }
    if (intFilter.not === null) {
      if (value === null) return false;
    }
    if (typeof intFilter.not === "number") {
      if (intFilter.not === value) return false;
    }
    if (Array.isArray(intFilter.in)) {
      if (!intFilter.in.includes(value)) return false;
    }
    if (Array.isArray(intFilter.notIn)) {
      if (intFilter.notIn.includes(value)) return false;
    }
    if (typeof intFilter.lt === "number") {
      if (!(value < intFilter.lt)) return false;
    }
    if (typeof intFilter.lte === "number") {
      if (!(value <= intFilter.lte)) return false;
    }
    if (typeof intFilter.gt === "number") {
      if (!(value > intFilter.gt)) return false;
    }
    if (typeof intFilter.gte === "number") {
      if (!(value >= intFilter.gte)) return false;
    }
  }
  return true;
}
