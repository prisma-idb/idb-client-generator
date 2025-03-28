import type { Prisma } from "@prisma/client";
import type { IDBPTransaction, StoreNames } from "idb";
import type { PrismaIDBSchema } from "./idb-interface";

export function convertToArray<T>(arg: T | T[]): T[] {
  return Array.isArray(arg) ? arg : [arg];
}

export type ReadwriteTransactionType = IDBPTransaction<PrismaIDBSchema, StoreNames<PrismaIDBSchema>[], "readwrite">;

export type ReadonlyTransactionType = IDBPTransaction<PrismaIDBSchema, StoreNames<PrismaIDBSchema>[], "readonly">;

export type TransactionType = ReadonlyTransactionType | ReadwriteTransactionType;

export const LogicalParams = ["AND", "OR", "NOT"] as const;

export function intersectArraysByNestedKey<T>(arrays: T[][], keyPath: string[]): T[] {
  return arrays.reduce((acc, array) =>
    acc.filter((item) => array.some((el) => keyPath.every((key) => el[key as keyof T] === item[key as keyof T]))),
  );
}

export function removeDuplicatesByKeyPath<T>(arrays: T[][], keyPath: string[]): T[] {
  const seen = new Set<string>();
  return arrays
    .flatMap((el) => el)
    .filter((item) => {
      const key = JSON.stringify(keyPath.map((key) => item[key as keyof T]));
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function applyLogicalFilters<
  T,
  R extends Prisma.Result<T, object, "findFirstOrThrow">,
  W extends Prisma.Args<T, "findFirstOrThrow">["where"],
>(
  records: R[],
  whereClause: W,
  tx: TransactionType,
  keyPath: string[],
  applyWhereFunction: (records: R[], clause: W, tx: TransactionType) => Promise<R[]>,
): Promise<R[]> {
  if (whereClause.AND) {
    records = intersectArraysByNestedKey(
      await Promise.all(
        convertToArray(whereClause.AND).map(async (clause) => await applyWhereFunction(records, clause, tx)),
      ),
      keyPath,
    );
  }
  if (whereClause.OR) {
    records = removeDuplicatesByKeyPath(
      await Promise.all(
        convertToArray(whereClause.OR).map(async (clause) => await applyWhereFunction(records, clause, tx)),
      ),
      keyPath,
    );
  }
  if (whereClause.NOT) {
    const excludedRecords = removeDuplicatesByKeyPath(
      await Promise.all(convertToArray(whereClause.NOT).map(async (clause) => applyWhereFunction(records, clause, tx))),
      keyPath,
    );
    records = records.filter(
      (item) =>
        !excludedRecords.some((excluded) => keyPath.every((key) => excluded[key as keyof R] === item[key as keyof R])),
    );
  }
  return records;
}

export function whereStringFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  stringFilter: undefined | string | Prisma.StringFilter<unknown> | null | Prisma.StringNullableFilter<unknown>,
): boolean {
  if (stringFilter === undefined) return true;

  const value = record[fieldName] as string | null;
  if (stringFilter === null) return value === null;

  if (typeof stringFilter === "string") {
    if (value !== stringFilter) return false;
  } else {
    if (stringFilter.equals === null) {
      if (value !== null) return false;
    }
    if (typeof stringFilter.equals === "string") {
      if (value === null) return false;
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
      if (value === null) return false;
      if (stringFilter.mode === "insensitive") {
        if (stringFilter.not.toLowerCase() === value.toLowerCase()) return false;
      } else {
        if (stringFilter.not === value) return false;
      }
    }
    if (Array.isArray(stringFilter.in)) {
      if (value === null) return false;
      if (stringFilter.mode === "insensitive") {
        if (!stringFilter.in.map((s) => s.toLowerCase()).includes(value.toLowerCase())) return false;
      } else {
        if (!stringFilter.in.includes(value)) return false;
      }
    }
    if (Array.isArray(stringFilter.notIn)) {
      if (value === null) return false;
      if (stringFilter.mode === "insensitive") {
        if (stringFilter.notIn.map((s) => s.toLowerCase()).includes(value.toLowerCase())) return false;
      } else {
        if (stringFilter.notIn.includes(value)) return false;
      }
    }
    if (typeof stringFilter.lt === "string") {
      if (value === null) return false;
      if (!(value < stringFilter.lt)) return false;
    }
    if (typeof stringFilter.lte === "string") {
      if (value === null) return false;
      if (!(value <= stringFilter.lte)) return false;
    }
    if (typeof stringFilter.gt === "string") {
      if (value === null) return false;
      if (!(value > stringFilter.gt)) return false;
    }
    if (typeof stringFilter.gte === "string") {
      if (value === null) return false;
      if (!(value >= stringFilter.gte)) return false;
    }
    if (typeof stringFilter.contains === "string") {
      if (value === null) return false;
      if (stringFilter.mode === "insensitive") {
        if (!value.toLowerCase().includes(stringFilter.contains.toLowerCase())) return false;
      } else {
        if (!value.includes(stringFilter.contains)) return false;
      }
    }
    if (typeof stringFilter.startsWith === "string") {
      if (value === null) return false;
      if (stringFilter.mode === "insensitive") {
        if (!value.toLowerCase().startsWith(stringFilter.startsWith.toLowerCase())) return false;
      } else {
        if (!value.startsWith(stringFilter.startsWith)) return false;
      }
    }
    if (typeof stringFilter.endsWith === "string") {
      if (value === null) return false;
      if (stringFilter.mode === "insensitive") {
        if (!value.toLowerCase().endsWith(stringFilter.endsWith.toLowerCase())) return false;
      } else {
        if (!value.endsWith(stringFilter.endsWith)) return false;
      }
    }
  }
  return true;
}

export function whereNumberFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  numberFilter:
    | undefined
    | number
    | Prisma.IntFilter<unknown>
    | Prisma.FloatFilter<unknown>
    | Prisma.IntNullableFilter<unknown>
    | null,
): boolean {
  if (numberFilter === undefined) return true;

  const value = record[fieldName] as number | null;
  if (numberFilter === null) return value === null;

  if (typeof numberFilter === "number") {
    if (value !== numberFilter) return false;
  } else {
    if (numberFilter.equals === null) {
      if (value !== null) return false;
    }
    if (typeof numberFilter.equals === "number") {
      if (numberFilter.equals !== value) return false;
    }
    if (numberFilter.not === null) {
      if (value === null) return false;
    }
    if (typeof numberFilter.not === "number") {
      if (numberFilter.not === value) return false;
    }
    if (Array.isArray(numberFilter.in)) {
      if (value === null) return false;
      if (!numberFilter.in.includes(value)) return false;
    }
    if (Array.isArray(numberFilter.notIn)) {
      if (value === null) return false;
      if (numberFilter.notIn.includes(value)) return false;
    }
    if (typeof numberFilter.lt === "number") {
      if (value === null) return false;
      if (!(value < numberFilter.lt)) return false;
    }
    if (typeof numberFilter.lte === "number") {
      if (value === null) return false;
      if (!(value <= numberFilter.lte)) return false;
    }
    if (typeof numberFilter.gt === "number") {
      if (value === null) return false;
      if (!(value > numberFilter.gt)) return false;
    }
    if (typeof numberFilter.gte === "number") {
      if (value === null) return false;
      if (!(value >= numberFilter.gte)) return false;
    }
  }
  return true;
}

export function whereBigIntFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  bigIntFilter: undefined | number | bigint | Prisma.BigIntFilter<unknown>,
): boolean {
  if (bigIntFilter === undefined) return true;

  const value = record[fieldName] as number | null;
  if (bigIntFilter === null) return value === null;

  if (typeof bigIntFilter === "number" || typeof bigIntFilter === "bigint") {
    if (value !== bigIntFilter) return false;
  } else {
    if (bigIntFilter.equals === null) {
      if (value !== null) return false;
    }
    if (typeof bigIntFilter.equals === "number" || typeof bigIntFilter.equals === "bigint") {
      if (bigIntFilter.equals != value) return false;
    }
    if (bigIntFilter.not === null) {
      if (value === null) return false;
    }
    if (typeof bigIntFilter.not === "number" || typeof bigIntFilter.not === "bigint") {
      if (bigIntFilter.not == value) return false;
    }
    if (Array.isArray(bigIntFilter.in)) {
      if (value === null) return false;
      if (!bigIntFilter.in.map((n) => BigInt(n)).includes(BigInt(value))) return false;
    }
    if (Array.isArray(bigIntFilter.notIn)) {
      if (value === null) return false;
      if (bigIntFilter.notIn.map((n) => BigInt(n)).includes(BigInt(value))) return false;
    }
    if (typeof bigIntFilter.lt === "number" || typeof bigIntFilter.lt === "bigint") {
      if (value === null) return false;
      if (!(value < bigIntFilter.lt)) return false;
    }
    if (typeof bigIntFilter.lte === "number" || typeof bigIntFilter.lte === "bigint") {
      if (value === null) return false;
      if (!(value <= bigIntFilter.lte)) return false;
    }
    if (typeof bigIntFilter.gt === "number" || typeof bigIntFilter.gt === "bigint") {
      if (value === null) return false;
      if (!(value > bigIntFilter.gt)) return false;
    }
    if (typeof bigIntFilter.gte === "number" || typeof bigIntFilter.gte === "bigint") {
      if (value === null) return false;
      if (!(value >= bigIntFilter.gte)) return false;
    }
  }
  return true;
}

export function whereBoolFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  boolFilter: undefined | boolean | Prisma.BoolFilter<unknown>,
): boolean {
  if (boolFilter === undefined) return true;

  const value = record[fieldName] as boolean | null;
  if (boolFilter === null) return value === null;

  if (typeof boolFilter === "boolean") {
    if (value !== boolFilter) return false;
  } else {
    if (boolFilter.equals === null) {
      if (value !== null) return false;
    }
    if (typeof boolFilter.equals === "boolean") {
      if (boolFilter.equals != value) return false;
    }
    if (boolFilter.not === null) {
      if (value === null) return false;
    }
    if (typeof boolFilter.not === "boolean") {
      if (boolFilter.not == value) return false;
    }
  }
  return true;
}

export function whereBytesFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  bytesFilter: undefined | Uint8Array | Prisma.BytesFilter<unknown>,
): boolean {
  if (bytesFilter === undefined) return true;

  function areUint8ArraysEqual(arr1: Uint8Array, arr2: Uint8Array) {
    if (arr1.length !== arr2.length) return false;
    for (let i = 0; i < arr1.length; i++) if (arr1[i] !== arr2[i]) return false;
    return true;
  }

  const value = record[fieldName] as Uint8Array | null;
  if (bytesFilter === null) return value === null;

  if (bytesFilter instanceof Uint8Array) {
    if (value === null) return false;
    if (!areUint8ArraysEqual(bytesFilter, value)) return false;
  } else {
    if (bytesFilter.equals === null) {
      if (value !== null) return false;
    }
    if (Buffer.isBuffer(bytesFilter.equals)) {
      if (value === null) return false;
      if (!bytesFilter.equals.equals(value)) return false;
    }
    if (bytesFilter.not === null) {
      if (value === null) return false;
    }
    if (Buffer.isBuffer(bytesFilter.not)) {
      if (value === null) return false;
      if (bytesFilter.not.equals(value)) return false;
    }
    if (Array.isArray(bytesFilter.in)) {
      if (value === null) return false;
      if (!bytesFilter.in.some((buffer) => areUint8ArraysEqual(buffer, value))) return false;
    }
    if (Array.isArray(bytesFilter.notIn)) {
      if (value === null) return false;
      if (bytesFilter.notIn.some((buffer) => areUint8ArraysEqual(buffer, value))) return false;
    }
  }
  return true;
}

export function whereDateTimeFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  dateTimeFilter: undefined | Date | string | Prisma.DateTimeFilter<unknown>,
): boolean {
  if (dateTimeFilter === undefined) return true;

  const value = record[fieldName] as Date | null;
  if (dateTimeFilter === null) return value === null;

  if (typeof dateTimeFilter === "string" || dateTimeFilter instanceof Date) {
    if (value === null) return false;
    if (new Date(dateTimeFilter).getTime() !== value.getTime()) return false;
  } else {
    if (dateTimeFilter.equals === null) {
      if (value !== null) return false;
    }
    if (typeof dateTimeFilter.equals === "string" || dateTimeFilter.equals instanceof Date) {
      if (value === null) return false;
      if (new Date(dateTimeFilter.equals).getTime() !== value.getTime()) return false;
    }
    if (dateTimeFilter.not === null) {
      if (value === null) return false;
    }
    if (typeof dateTimeFilter.equals === "string" || dateTimeFilter.equals instanceof Date) {
      if (value === null) return false;
      if (new Date(dateTimeFilter.equals).getTime() === value.getTime()) return false;
    }
    if (Array.isArray(dateTimeFilter.in)) {
      if (value === null) return false;
      if (!dateTimeFilter.in.map((d) => new Date(d)).some((d) => d.getTime() === value.getTime())) return false;
    }
    if (Array.isArray(dateTimeFilter.notIn)) {
      if (value === null) return false;
      if (dateTimeFilter.notIn.map((d) => new Date(d)).some((d) => d.getTime() === value.getTime())) return false;
    }
    if (typeof dateTimeFilter.lt === "string" || dateTimeFilter.lt instanceof Date) {
      if (value === null) return false;
      if (!(value.getTime() < new Date(dateTimeFilter.lt).getTime())) return false;
    }
    if (typeof dateTimeFilter.lte === "string" || dateTimeFilter.lte instanceof Date) {
      if (value === null) return false;
      if (!(value.getTime() <= new Date(dateTimeFilter.lte).getTime())) return false;
    }
    if (typeof dateTimeFilter.gt === "string" || dateTimeFilter.gt instanceof Date) {
      if (value === null) return false;
      if (!(value.getTime() > new Date(dateTimeFilter.gt).getTime())) return false;
    }
    if (typeof dateTimeFilter.gte === "string" || dateTimeFilter.gte instanceof Date) {
      if (value === null) return false;
      if (!(value.getTime() >= new Date(dateTimeFilter.gte).getTime())) return false;
    }
  }
  return true;
}

export function whereStringListFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  scalarListFilter: undefined | Prisma.StringNullableListFilter<unknown>,
): boolean {
  if (scalarListFilter === undefined) return true;

  const value = record[fieldName] as string[] | undefined;
  if (value === undefined && Object.keys(scalarListFilter).length) return false;
  if (Array.isArray(scalarListFilter.equals)) {
    if (scalarListFilter.equals.length !== value?.length) return false;
    if (!scalarListFilter.equals.every((val, i) => val === value[i])) return false;
  }
  if (typeof scalarListFilter.has === "string") {
    if (!value?.includes(scalarListFilter.has)) return false;
  }
  if (scalarListFilter.has === null) return false;
  if (Array.isArray(scalarListFilter.hasSome)) {
    if (!scalarListFilter.hasSome.some((val) => value?.includes(val))) return false;
  }
  if (Array.isArray(scalarListFilter.hasEvery)) {
    if (!scalarListFilter.hasEvery.every((val) => value?.includes(val))) return false;
  }
  if (scalarListFilter.isEmpty === true && value?.length) return false;
  if (scalarListFilter.isEmpty === false && value?.length === 0) return false;
  return true;
}

export function whereNumberListFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  scalarListFilter: undefined | Prisma.IntNullableListFilter<unknown> | Prisma.FloatNullableListFilter<unknown>,
): boolean {
  if (scalarListFilter === undefined) return true;

  const value = record[fieldName] as number[] | undefined;
  if (value === undefined && Object.keys(scalarListFilter).length) return false;
  if (Array.isArray(scalarListFilter.equals)) {
    if (scalarListFilter.equals.length !== value?.length) return false;
    if (!scalarListFilter.equals.every((val, i) => val === value[i])) return false;
  }
  if (typeof scalarListFilter.has === "number") {
    if (!value?.includes(scalarListFilter.has)) return false;
  }
  if (scalarListFilter.has === null) return false;
  if (Array.isArray(scalarListFilter.hasSome)) {
    if (!scalarListFilter.hasSome.some((val) => value?.includes(val))) return false;
  }
  if (Array.isArray(scalarListFilter.hasEvery)) {
    if (!scalarListFilter.hasEvery.every((val) => value?.includes(val))) return false;
  }
  if (scalarListFilter.isEmpty === true && value?.length) return false;
  if (scalarListFilter.isEmpty === false && value?.length === 0) return false;
  return true;
}

export function whereBigIntListFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  scalarListFilter: undefined | Prisma.BigIntNullableListFilter<unknown>,
): boolean {
  if (scalarListFilter === undefined) return true;

  const value = record[fieldName] as bigint[] | undefined;
  if (value === undefined && Object.keys(scalarListFilter).length) return false;
  if (Array.isArray(scalarListFilter.equals)) {
    if (scalarListFilter.equals.length !== value?.length) return false;
    if (!scalarListFilter.equals.every((val, i) => BigInt(val) === value[i])) return false;
  }
  if (typeof scalarListFilter.has === "bigint" || typeof scalarListFilter.has === "number") {
    if (!value?.includes(BigInt(scalarListFilter.has))) return false;
  }
  if (scalarListFilter.has === null) return false;
  if (Array.isArray(scalarListFilter.hasSome)) {
    if (!scalarListFilter.hasSome.some((val) => value?.includes(BigInt(val)))) return false;
  }
  if (Array.isArray(scalarListFilter.hasEvery)) {
    if (!scalarListFilter.hasEvery.every((val) => value?.includes(BigInt(val)))) return false;
  }
  if (scalarListFilter.isEmpty === true && value?.length) return false;
  if (scalarListFilter.isEmpty === false && value?.length === 0) return false;
  return true;
}

export function whereBooleanListFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  scalarListFilter: undefined | Prisma.BoolNullableListFilter<unknown>,
): boolean {
  if (scalarListFilter === undefined) return true;

  const value = record[fieldName] as boolean[] | undefined;
  if (value === undefined && Object.keys(scalarListFilter).length) return false;
  if (Array.isArray(scalarListFilter.equals)) {
    if (scalarListFilter.equals.length !== value?.length) return false;
    if (!scalarListFilter.equals.every((val, i) => val === value[i])) return false;
  }
  if (typeof scalarListFilter.has === "boolean") {
    if (!value?.includes(scalarListFilter.has)) return false;
  }
  if (scalarListFilter.has === null) return false;
  if (Array.isArray(scalarListFilter.hasSome)) {
    if (!scalarListFilter.hasSome.some((val) => value?.includes(val))) return false;
  }
  if (Array.isArray(scalarListFilter.hasEvery)) {
    if (!scalarListFilter.hasEvery.every((val) => value?.includes(val))) return false;
  }
  if (scalarListFilter.isEmpty === true && value?.length) return false;
  if (scalarListFilter.isEmpty === false && value?.length === 0) return false;
  return true;
}

export function whereBytesListFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  scalarListFilter: undefined | Prisma.BytesNullableListFilter<unknown>,
): boolean {
  if (scalarListFilter === undefined) return true;

  const value = record[fieldName] as Uint8Array[] | undefined;
  if (value === undefined && Object.keys(scalarListFilter).length) return false;
  if (Array.isArray(scalarListFilter.equals)) {
    if (scalarListFilter.equals.length !== value?.length) return false;
    if (!scalarListFilter.equals.every((val, i) => val === value[i])) return false;
  }
  if (scalarListFilter.has instanceof Uint8Array) {
    if (!value?.includes(scalarListFilter.has)) return false;
  }
  if (scalarListFilter.has === null) return false;
  if (Array.isArray(scalarListFilter.hasSome)) {
    if (!scalarListFilter.hasSome.some((val) => value?.includes(val))) return false;
  }
  if (Array.isArray(scalarListFilter.hasEvery)) {
    if (!scalarListFilter.hasEvery.every((val) => value?.includes(val))) return false;
  }
  if (scalarListFilter.isEmpty === true && value?.length) return false;
  if (scalarListFilter.isEmpty === false && value?.length === 0) return false;
  return true;
}

export function whereDateTimeListFilter<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  scalarListFilter: undefined | Prisma.DateTimeNullableListFilter<unknown>,
): boolean {
  if (scalarListFilter === undefined) return true;

  const value = record[fieldName] as Date[] | undefined;
  if (value === undefined && Object.keys(scalarListFilter).length) return false;
  if (Array.isArray(scalarListFilter.equals)) {
    if (scalarListFilter.equals.length !== value?.length) return false;
    if (!scalarListFilter.equals.every((val, i) => new Date(val).getTime() === value[i].getTime())) return false;
  }
  if (scalarListFilter.has instanceof Date || typeof scalarListFilter.has === "string") {
    if (!value?.includes(new Date(scalarListFilter.has))) return false;
  }
  if (scalarListFilter.has === null) return false;
  if (Array.isArray(scalarListFilter.hasSome)) {
    if (!scalarListFilter.hasSome.some((val) => value?.includes(new Date(val)))) return false;
  }
  if (Array.isArray(scalarListFilter.hasEvery)) {
    if (!scalarListFilter.hasEvery.every((val) => value?.includes(new Date(val)))) return false;
  }
  if (scalarListFilter.isEmpty === true && value?.length) return false;
  if (scalarListFilter.isEmpty === false && value?.length === 0) return false;
  return true;
}

export function handleStringUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  stringUpdate:
    | undefined
    | string
    | Prisma.StringFieldUpdateOperationsInput
    | null
    | Prisma.NullableStringFieldUpdateOperationsInput,
) {
  if (stringUpdate === undefined) return;
  if (typeof stringUpdate === "string" || stringUpdate === null) {
    (record[fieldName] as string | null) = stringUpdate;
  } else if (stringUpdate.set !== undefined) {
    (record[fieldName] as string | null) = stringUpdate.set;
  }
}

export function handleBooleanUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  booleanUpdate: undefined | boolean | Prisma.BoolFieldUpdateOperationsInput,
) {
  if (booleanUpdate === undefined) return;
  if (typeof booleanUpdate === "boolean") {
    (record[fieldName] as boolean) = booleanUpdate;
  } else if (booleanUpdate.set !== undefined) {
    (record[fieldName] as boolean) = booleanUpdate.set;
  }
}

export function handleDateTimeUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  dateTimeUpdate: undefined | Date | string | Prisma.DateTimeFieldUpdateOperationsInput,
) {
  if (dateTimeUpdate === undefined) return;
  if (typeof dateTimeUpdate === "string" || dateTimeUpdate instanceof Date) {
    (record[fieldName] as Date) = new Date(dateTimeUpdate);
  } else if (dateTimeUpdate.set !== undefined) {
    (record[fieldName] as Date) = new Date(dateTimeUpdate.set);
  }
}

export function handleBytesUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  bytesUpdate: undefined | Uint8Array | Prisma.BytesFieldUpdateOperationsInput,
) {
  if (bytesUpdate === undefined) return;
  if (bytesUpdate instanceof Uint8Array) {
    (record[fieldName] as Uint8Array) = bytesUpdate;
  } else if (bytesUpdate.set !== undefined) {
    (record[fieldName] as Uint8Array) = bytesUpdate.set;
  }
}

export function handleIntUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  intUpdate:
    | undefined
    | number
    | Prisma.IntFieldUpdateOperationsInput
    | null
    | Prisma.NullableIntFieldUpdateOperationsInput,
) {
  if (intUpdate === undefined) return;
  if (typeof intUpdate === "number" || intUpdate === null) {
    (record[fieldName] as number | null) = intUpdate;
  } else if (intUpdate.set !== undefined) {
    (record[fieldName] as number | null) = intUpdate.set;
  } else if (intUpdate.increment !== undefined && record[fieldName] !== null) {
    (record[fieldName] as number) += intUpdate.increment;
  } else if (intUpdate.decrement !== undefined && record[fieldName] !== null) {
    (record[fieldName] as number) -= intUpdate.decrement;
  } else if (intUpdate.multiply !== undefined && record[fieldName] !== null) {
    (record[fieldName] as number) *= intUpdate.multiply;
  } else if (intUpdate.divide !== undefined && record[fieldName] !== null) {
    (record[fieldName] as number) /= intUpdate.divide;
  }
}

export function handleBigIntUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  bigIntUpdate: undefined | bigint | number | Prisma.BigIntFieldUpdateOperationsInput,
) {
  if (bigIntUpdate === undefined) return;
  if (typeof bigIntUpdate === "bigint" || typeof bigIntUpdate === "number") {
    (record[fieldName] as bigint) = BigInt(bigIntUpdate);
  } else if (bigIntUpdate.set !== undefined) {
    (record[fieldName] as bigint) = BigInt(bigIntUpdate.set);
  } else if (bigIntUpdate.increment !== undefined && record[fieldName] !== null) {
    (record[fieldName] as bigint) += BigInt(bigIntUpdate.increment);
  } else if (bigIntUpdate.decrement !== undefined && record[fieldName] !== null) {
    (record[fieldName] as bigint) -= BigInt(bigIntUpdate.decrement);
  } else if (bigIntUpdate.multiply !== undefined && record[fieldName] !== null) {
    (record[fieldName] as bigint) *= BigInt(bigIntUpdate.multiply);
  } else if (bigIntUpdate.divide !== undefined && record[fieldName] !== null) {
    (record[fieldName] as bigint) /= BigInt(bigIntUpdate.divide);
  }
}

export function handleFloatUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  floatUpdate: undefined | number | Prisma.FloatFieldUpdateOperationsInput,
) {
  if (floatUpdate === undefined) return;
  if (typeof floatUpdate === "number") {
    (record[fieldName] as number) = floatUpdate;
  } else if (floatUpdate.set !== undefined) {
    (record[fieldName] as number) = floatUpdate.set;
  } else if (floatUpdate.increment !== undefined && record[fieldName] !== null) {
    (record[fieldName] as number) += floatUpdate.increment;
  } else if (floatUpdate.decrement !== undefined && record[fieldName] !== null) {
    (record[fieldName] as number) -= floatUpdate.decrement;
  } else if (floatUpdate.multiply !== undefined && record[fieldName] !== null) {
    (record[fieldName] as number) *= floatUpdate.multiply;
  } else if (floatUpdate.divide !== undefined && record[fieldName] !== null) {
    (record[fieldName] as number) /= floatUpdate.divide;
  }
}

export function handleEnumUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  enumUpdate: undefined | string | { set?: string } | null | { set?: string | null },
) {
  if (enumUpdate === undefined) return;
  if (typeof enumUpdate === "string" || enumUpdate === null) {
    (record[fieldName] as string | null) = enumUpdate;
  } else if (enumUpdate.set !== undefined) {
    (record[fieldName] as string | null) = enumUpdate.set;
  }
}

export function handleScalarListUpdateField<T, R extends Prisma.Result<T, object, "findFirstOrThrow">>(
  record: R,
  fieldName: keyof R,
  listUpdate: undefined | unknown[] | { set?: unknown[]; push?: unknown | unknown[] },
) {
  if (listUpdate === undefined) return;
  if (Array.isArray(listUpdate)) {
    (record[fieldName] as unknown[] | undefined) = listUpdate;
  } else if (listUpdate.set !== undefined) {
    (record[fieldName] as unknown[] | undefined) = listUpdate.set;
  } else if (listUpdate.push !== undefined) {
    if (Array.isArray(record[fieldName])) {
      record[fieldName].push(...convertToArray(listUpdate.push));
    } else {
      (record[fieldName] as unknown[]) = convertToArray(listUpdate.push);
    }
  }
}

export function genericComparator(
  a: unknown,
  b: unknown,
  sortOrder: Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } = "asc",
): number {
  if (typeof sortOrder !== "string" && sortOrder.nulls) {
    const nullMultiplier = sortOrder.nulls === "first" ? -1 : 1;

    if (a === null && b === null) return 0;
    if (a === null || b === null) return (a === null ? 1 : -1) * nullMultiplier;
  }
  const multiplier = typeof sortOrder === "string" ? (sortOrder === "asc" ? 1 : -1) : sortOrder.sort === "asc" ? 1 : -1;
  let returnValue: number | undefined;

  if (typeof a === "string" && typeof b === "string") {
    returnValue = a.localeCompare(b);
  }
  if (typeof a === "number" && typeof b === "number") {
    returnValue = a - b;
  }
  if (typeof a === "bigint" && typeof b === "bigint") {
    if (a > b) {
      returnValue = 1;
    } else if (a < b) {
      returnValue = -1;
    } else {
      returnValue = 0;
    }
  }
  if (a instanceof Date && b instanceof Date) {
    returnValue = a.getTime() - b.getTime();
  }
  if (a instanceof Uint8Array && b instanceof Uint8Array) {
    returnValue = a.length - b.length;
  }
  if (typeof a === "boolean" && typeof b === "boolean") {
    returnValue = a === b ? 0 : a ? 1 : -1;
  }
  if (returnValue === undefined) {
    throw new Error(`Comparison of type: ${typeof a} not yet supported`);
  }
  return returnValue * multiplier;
}
