import type { IDBPTransaction, StoreNames } from 'idb';
import type { PrismaIDBSchema } from './idb-interface';
import type { Prisma } from '../../generated/prisma/client';

export function convertToArray<T>(arg: T | T[]): T[] {
	return Array.isArray(arg) ? arg : [arg];
}
export type ReadwriteTransactionType = IDBPTransaction<
	PrismaIDBSchema,
	StoreNames<PrismaIDBSchema>[],
	'readwrite'
>;
export type ReadonlyTransactionType = IDBPTransaction<
	PrismaIDBSchema,
	StoreNames<PrismaIDBSchema>[],
	'readonly'
>;
export type TransactionType = ReadonlyTransactionType | ReadwriteTransactionType;

export const LogicalParams = ['AND', 'OR', 'NOT'] as const;

export function intersectArraysByNestedKey<T>(arrays: T[][], keyPath: string[]): T[] {
	return arrays.reduce((acc, array) =>
		acc.filter((item) =>
			array.some((el) => keyPath.every((key) => el[key as keyof T] === item[key as keyof T]))
		)
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
	R extends Prisma.Result<T, object, 'findFirstOrThrow'>,
	W extends Prisma.Args<T, 'findFirstOrThrow'>['where']
>(
	records: R[],
	whereClause: W,
	tx: TransactionType,
	keyPath: string[],
	applyWhereFunction: (records: R[], clause: W, tx: TransactionType) => Promise<R[]>
): Promise<R[]> {
	if (whereClause.AND) {
		records = intersectArraysByNestedKey(
			await Promise.all(
				convertToArray(whereClause.AND).map(
					async (clause) => await applyWhereFunction(records, clause, tx)
				)
			),
			keyPath
		);
	}
	if (whereClause.OR) {
		records = removeDuplicatesByKeyPath(
			await Promise.all(
				convertToArray(whereClause.OR).map(
					async (clause) => await applyWhereFunction(records, clause, tx)
				)
			),
			keyPath
		);
	}
	if (whereClause.NOT) {
		const excludedRecords = removeDuplicatesByKeyPath(
			await Promise.all(
				convertToArray(whereClause.NOT).map(async (clause) =>
					applyWhereFunction(records, clause, tx)
				)
			),
			keyPath
		);
		records = records.filter(
			(item) =>
				!excludedRecords.some((excluded) =>
					keyPath.every((key) => excluded[key as keyof R] === item[key as keyof R])
				)
		);
	}
	return records;
}
export function whereStringFilter<T, R extends Prisma.Result<T, object, 'findFirstOrThrow'>>(
	record: R,
	fieldName: keyof R,
	stringFilter: undefined | string | Prisma.StringFilter<unknown>
): boolean {
	if (stringFilter === undefined) return true;

	const value = record[fieldName] as string | null;
	if (stringFilter === null) return value === null;

	if (typeof stringFilter === 'string') {
		if (value !== stringFilter) return false;
	} else {
		if (stringFilter.equals === null) {
			if (value !== null) return false;
		}
		if (typeof stringFilter.equals === 'string') {
			if (value === null) return false;
			if (stringFilter.mode === 'insensitive') {
				if (stringFilter.equals.toLowerCase() !== value.toLowerCase()) return false;
			} else {
				if (stringFilter.equals !== value) return false;
			}
		}
		if (stringFilter.not === null) {
			if (value === null) return false;
		}
		if (typeof stringFilter.not === 'string') {
			if (value === null) return false;
			if (stringFilter.mode === 'insensitive') {
				if (stringFilter.not.toLowerCase() === value.toLowerCase()) return false;
			} else {
				if (stringFilter.not === value) return false;
			}
		}
		if (Array.isArray(stringFilter.in)) {
			if (value === null) return false;
			if (stringFilter.mode === 'insensitive') {
				if (!stringFilter.in.map((s) => s.toLowerCase()).includes(value.toLowerCase()))
					return false;
			} else {
				if (!stringFilter.in.includes(value)) return false;
			}
		}
		if (Array.isArray(stringFilter.notIn)) {
			if (value === null) return false;
			if (stringFilter.mode === 'insensitive') {
				if (stringFilter.notIn.map((s) => s.toLowerCase()).includes(value.toLowerCase()))
					return false;
			} else {
				if (stringFilter.notIn.includes(value)) return false;
			}
		}
		if (typeof stringFilter.lt === 'string') {
			if (value === null) return false;
			if (!(value < stringFilter.lt)) return false;
		}
		if (typeof stringFilter.lte === 'string') {
			if (value === null) return false;
			if (!(value <= stringFilter.lte)) return false;
		}
		if (typeof stringFilter.gt === 'string') {
			if (value === null) return false;
			if (!(value > stringFilter.gt)) return false;
		}
		if (typeof stringFilter.gte === 'string') {
			if (value === null) return false;
			if (!(value >= stringFilter.gte)) return false;
		}
		if (typeof stringFilter.contains === 'string') {
			if (value === null) return false;
			if (stringFilter.mode === 'insensitive') {
				if (!value.toLowerCase().includes(stringFilter.contains.toLowerCase())) return false;
			} else {
				if (!value.includes(stringFilter.contains)) return false;
			}
		}
		if (typeof stringFilter.startsWith === 'string') {
			if (value === null) return false;
			if (stringFilter.mode === 'insensitive') {
				if (!value.toLowerCase().startsWith(stringFilter.startsWith.toLowerCase())) return false;
			} else {
				if (!value.startsWith(stringFilter.startsWith)) return false;
			}
		}
		if (typeof stringFilter.endsWith === 'string') {
			if (value === null) return false;
			if (stringFilter.mode === 'insensitive') {
				if (!value.toLowerCase().endsWith(stringFilter.endsWith.toLowerCase())) return false;
			} else {
				if (!value.endsWith(stringFilter.endsWith)) return false;
			}
		}
	}
	return true;
}
export function whereBoolFilter<T, R extends Prisma.Result<T, object, 'findFirstOrThrow'>>(
	record: R,
	fieldName: keyof R,
	boolFilter: undefined | boolean | Prisma.BoolFilter<unknown>
): boolean {
	if (boolFilter === undefined) return true;

	const value = record[fieldName] as boolean | null;
	if (boolFilter === null) return value === null;

	if (typeof boolFilter === 'boolean') {
		if (value !== boolFilter) return false;
	} else {
		if (boolFilter.equals === null) {
			if (value !== null) return false;
		}
		if (typeof boolFilter.equals === 'boolean') {
			if (boolFilter.equals != value) return false;
		}
		if (boolFilter.not === null) {
			if (value === null) return false;
		}
		if (typeof boolFilter.not === 'boolean') {
			if (boolFilter.not == value) return false;
		}
	}
	return true;
}
export function handleStringUpdateField<T, R extends Prisma.Result<T, object, 'findFirstOrThrow'>>(
	record: R,
	fieldName: keyof R,
	stringUpdate: undefined | string | Prisma.StringFieldUpdateOperationsInput
): void {
	if (stringUpdate === undefined) return;
	if (typeof stringUpdate === 'string') {
		(record[fieldName] as string) = stringUpdate;
	} else if (stringUpdate.set !== undefined) {
		(record[fieldName] as string) = stringUpdate.set;
	}
}
export function handleBooleanUpdateField<T, R extends Prisma.Result<T, object, 'findFirstOrThrow'>>(
	record: R,
	fieldName: keyof R,
	booleanUpdate: undefined | boolean | Prisma.BoolFieldUpdateOperationsInput
): void {
	if (booleanUpdate === undefined) return;
	if (typeof booleanUpdate === 'boolean') {
		(record[fieldName] as boolean) = booleanUpdate;
	} else if (booleanUpdate.set !== undefined) {
		(record[fieldName] as boolean) = booleanUpdate.set;
	}
}
export function genericComparator(
	a: unknown,
	b: unknown,
	sortOrder: Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: 'first' | 'last' } = 'asc'
): number {
	if (typeof sortOrder !== 'string' && sortOrder.nulls) {
		const nullMultiplier = sortOrder.nulls === 'first' ? -1 : 1;

		if (a === null && b === null) return 0;
		if (a === null || b === null) return (a === null ? 1 : -1) * nullMultiplier;
	}
	const multiplier =
		typeof sortOrder === 'string'
			? sortOrder === 'asc'
				? 1
				: -1
			: sortOrder.sort === 'asc'
				? 1
				: -1;
	let returnValue: number | undefined;

	if (typeof a === 'string' && typeof b === 'string') {
		returnValue = a.localeCompare(b);
	}
	if (typeof a === 'number' && typeof b === 'number') {
		returnValue = a - b;
	}
	if (typeof a === 'bigint' && typeof b === 'bigint') {
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
	if (typeof a === 'boolean' && typeof b === 'boolean') {
		returnValue = a === b ? 0 : a ? 1 : -1;
	}
	if (returnValue === undefined) {
		throw new Error(`Comparison of type: ${typeof a} not yet supported`);
	}
	return returnValue * multiplier;
}
export type { AppliedResult, SyncWorkerOptions, SyncWorker } from './idb-interface';
