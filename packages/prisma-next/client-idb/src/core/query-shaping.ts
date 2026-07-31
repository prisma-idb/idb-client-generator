import type { IdbFilterExpr, IdbOrExpr } from "@prisma-next-idb/adapter-idb/runtime";
import { andExpr } from "@prisma-next-idb/adapter-idb/runtime";
import type { IdbRowComparator } from "@prisma-next-idb/driver-idb/runtime";

/** Describes an extractable indexed equality that can narrow a cursor scan. */
export interface IndexEqualityHint {
  /** The IDB index name (e.g. `"byEmail"`). */
  readonly indexName: string;
  /** The equality value to pass to `IDBKeyRange.only()`. */
  readonly value: unknown;
  /** The remainder of the filter after the indexed condition is peeled off. */
  readonly remainingFilter: IdbFilterExpr | undefined;
}

/**
 * Describes an OR filter where every branch can be satisfied by an indexed
 * equality lookup. Each branch maps to one `IDBKeyRange.only()` cursor scan;
 * the caller unions the results and deduplicates before applying
 * `remainingFilter`.
 */
export interface IndexOrHint {
  readonly branches: ReadonlyArray<{ readonly indexName: string; readonly value: unknown }>;
  /** AND conditions that wrapped the OR — applied in-memory after the union. */
  readonly remainingFilter: IdbFilterExpr | undefined;
}

/**
 * Combine accumulated filter expressions with AND.
 *
 * Returns `undefined` when no filter is present so callers can skip building a
 * row-filter closure. Shared by {@link IdbStoreAccessorImpl} (top-level scans)
 * and the relation loader (refined `include()` child scans).
 */
export function combineFilterExprs(filters: ReadonlyArray<IdbFilterExpr>): IdbFilterExpr | undefined {
  if (filters.length === 0) return undefined;
  if (filters.length === 1) return filters[0];
  return andExpr(filters);
}

/** Recursively flatten nested AND nodes into a single array of children. */
function flattenAnd(filter: IdbFilterExpr): IdbFilterExpr[] {
  if (filter.kind !== "and") return [filter];
  return filter.exprs.flatMap(flattenAnd);
}

/**
 * Scan the combined filter expression for the first `eq` field condition whose
 * field has a matching IDB index (`fieldToIndexName[field]` is set).
 *
 * When found, the indexed condition is peeled off and returned as an
 * {@link IndexEqualityHint}; any remaining conditions are preserved in
 * `remainingFilter`. Returns `null` when no usable index can be found.
 *
 * Nested AND nodes are flattened before scanning, so deeply-composed filters
 * are handled correctly. Only `eq` conditions are considered — range operators
 * (`gt`, `lt`, etc.) could also use an index range but that optimization is
 * not yet implemented.
 */
export function extractIndexEqualityHint(
  filter: IdbFilterExpr | undefined,
  fieldToIndexName: Record<string, string>
): IndexEqualityHint | null {
  if (filter === undefined) return null;

  if (filter.kind === "field" && filter.op === "eq") {
    const indexName = fieldToIndexName[filter.field];
    if (indexName !== undefined) {
      return { indexName, value: filter.value, remainingFilter: undefined };
    }
    return null;
  }

  if (filter.kind === "and") {
    const flat = flattenAnd(filter);
    for (let i = 0; i < flat.length; i++) {
      const expr = flat[i]!;
      if (expr.kind === "field" && expr.op === "eq") {
        const indexName = fieldToIndexName[expr.field];
        if (indexName !== undefined) {
          const rest = flat.filter((_, j) => j !== i);
          const remainingFilter = rest.length === 0 ? undefined : rest.length === 1 ? rest[0]! : andExpr(rest);
          return { indexName, value: expr.value, remainingFilter };
        }
      }
    }
  }

  return null;
}

/**
 * Check whether every branch of an OR node is a single `field eq value`
 * condition whose field has a matching index. Returns an {@link IndexOrHint}
 * when the whole OR can be satisfied by N point-range cursor scans, `null`
 * otherwise.
 */
function tryExtractOrBranches(
  orNode: IdbOrExpr,
  fieldToIndexName: Record<string, string>,
  remainingFilter: IdbFilterExpr | undefined
): IndexOrHint | null {
  if (orNode.exprs.length === 0) return null;
  const branches: { indexName: string; value: unknown }[] = [];
  for (const expr of orNode.exprs) {
    if (expr.kind !== "field" || expr.op !== "eq") return null;
    const indexName = fieldToIndexName[expr.field];
    if (indexName === undefined) return null;
    branches.push({ indexName, value: expr.value });
  }
  return { branches, remainingFilter };
}

/**
 * Attempt to extract an {@link IndexOrHint} from `filter`.
 *
 * Handles two shapes:
 * - Top-level `or` where every branch is `field eq value` on an indexed field.
 * - Top-level `and` (with nested ANDs flattened) that contains exactly one `or`
 *   child fitting the above pattern; the remaining AND children become
 *   `remainingFilter` applied in-memory after the union.
 *
 * Returns `null` when the filter cannot be accelerated via OR index scans.
 */
export function extractIndexOrHint(
  filter: IdbFilterExpr | undefined,
  fieldToIndexName: Record<string, string>
): IndexOrHint | null {
  if (filter === undefined) return null;

  if (filter.kind === "or") {
    return tryExtractOrBranches(filter, fieldToIndexName, undefined);
  }

  if (filter.kind === "and") {
    const flat = flattenAnd(filter);
    const orIndices: number[] = [];
    for (let i = 0; i < flat.length; i++) {
      if (flat[i]!.kind === "or") orIndices.push(i);
    }
    if (orIndices.length !== 1) return null;
    const orIdx = orIndices[0]!;
    const orNode = flat[orIdx]! as IdbOrExpr;
    const rest = flat.filter((_, j) => j !== orIdx);
    const remaining = rest.length === 0 ? undefined : rest.length === 1 ? rest[0]! : andExpr(rest);
    return tryExtractOrBranches(orNode, fieldToIndexName, remaining);
  }

  return null;
}

/**
 * Build an in-memory comparator from an `orderBy` spec (field → direction).
 *
 * Returns `undefined` when there is nothing to sort by. Compares fields in
 * declaration order; values are primitives (strings, numbers, dates) in
 * practice, so JS relational comparison is sufficient.
 */
export function buildRowComparator(orderBy: Record<string, "asc" | "desc"> | undefined): IdbRowComparator | undefined {
  if (orderBy === undefined) return undefined;
  return (a: Record<string, unknown>, b: Record<string, unknown>): number => {
    for (const [field, dir] of Object.entries(orderBy)) {
      const av = a[field];
      const bv = b[field];
      if (av === bv) continue;
      const cmp = (av as string | number) < (bv as string | number) ? -1 : 1;
      return dir === "desc" ? -cmp : cmp;
    }
    return 0;
  };
}
