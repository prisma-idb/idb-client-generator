/**
 * Applies `contract.execution.mutations.defaults` (ADR 158) during a
 * create/update — IDB's equivalent of the SQL family's
 * `ExecutionContext.applyMutationDefaults`. Today the only generator id is
 * `"timestampNow"`, backing `temporal.updatedAt()` fields.
 *
 * Semantics mirror the SQL reference implementation:
 * - a caller-provided value always wins over a default;
 * - an empty update patch skips every `onUpdate` default (no write ⇒ no
 *   `@updatedAt` advance);
 * - a generator's value is cached per id so a whole top-level mutation call
 *   (e.g. a `createAll()` batch) shares one generated value across every row
 *   it backs, matching `timestampNow`'s `'query'`-stability in SQL.
 */
import type { ExecutionMutationDefault, ExecutionMutationDefaultValue } from "@prisma-next/contract/types";

/** Per-top-level-mutation-call cache, keyed by generator id. Create one with {@link createMutationDefaultsCache}. */
export type MutationDefaultsCache = Map<string, unknown>;

export function createMutationDefaultsCache(): MutationDefaultsCache {
  return new Map();
}

function computeGeneratedValue(spec: ExecutionMutationDefaultValue): unknown {
  switch (spec.id) {
    case "timestampNow":
      return new Date();
    default:
      throw new Error(`Unknown mutation-default generator id "${spec.id}"`);
  }
}

function resolveGeneratedValue(spec: ExecutionMutationDefaultValue, cache: MutationDefaultsCache): unknown {
  const cached = cache.get(spec.id);
  if (cached !== undefined) return cached;
  const value = computeGeneratedValue(spec);
  cache.set(spec.id, value);
  return value;
}

/**
 * Fills in every column with an `onCreate` default that `data` doesn't
 * already set. Returns `data` unchanged (same reference) if there's nothing
 * to apply.
 */
export function applyCreateDefaults(
  defaults: readonly ExecutionMutationDefault[] | undefined,
  storeName: string,
  data: Record<string, unknown>,
  cache: MutationDefaultsCache
): Record<string, unknown> {
  if (!defaults || defaults.length === 0) return data;
  let result = data;
  for (const d of defaults) {
    if (d.ref.table !== storeName || !d.onCreate) continue;
    if (Object.hasOwn(result, d.ref.column)) continue;
    if (result === data) result = { ...data };
    result[d.ref.column] = resolveGeneratedValue(d.onCreate, cache);
  }
  return result;
}

/**
 * Fills in every column with an `onUpdate` default that `patch` doesn't
 * already set. An empty `patch` is returned unchanged — no write means no
 * default should fire either (matches SQL's "empty update payloads skip
 * onUpdate defaults" rule).
 */
export function applyUpdateDefaults(
  defaults: readonly ExecutionMutationDefault[] | undefined,
  storeName: string,
  patch: Record<string, unknown>,
  cache: MutationDefaultsCache
): Record<string, unknown> {
  if (Object.keys(patch).length === 0) return patch;
  if (!defaults || defaults.length === 0) return patch;
  let result = patch;
  for (const d of defaults) {
    if (d.ref.table !== storeName || !d.onUpdate) continue;
    if (Object.hasOwn(result, d.ref.column)) continue;
    if (result === patch) result = { ...patch };
    result[d.ref.column] = resolveGeneratedValue(d.onUpdate, cache);
  }
  return result;
}
