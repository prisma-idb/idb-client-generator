import type { IdbFilterExpr } from "@prisma-next-idb/adapter-idb/runtime";

/**
 * Immutable state carried by each {@link IdbStoreAccessorImpl} node in the
 * builder chain.
 *
 * Every mutating method (`.where()`, `.take()`, etc.) returns a cloned
 * instance with an updated state rather than mutating in place, making the
 * accessor safe to reuse across multiple query branches.
 */
export interface IdbAccessorState {
  /**
   * Accumulated filter expressions. Multiple `.where()` calls compose
   * with AND semantics — the planner wraps them in an `andExpr` when
   * lowering. Each entry is already either an `IdbFieldFilter`, a
   * combinator, or a `null-check` node — never raw shorthand records.
   */
  readonly filters: ReadonlyArray<IdbFilterExpr>;
  /** Sort spec: field → direction. Applied as an in-memory comparator. */
  readonly orderBy?: Record<string, "asc" | "desc">;
  /** OFFSET (number of rows to skip). */
  readonly skip?: number;
  /** LIMIT (maximum number of rows to return). */
  readonly take?: number;
  /** Relations that have been `.include()`d — keys are relation names. */
  readonly includes: Record<string, true>;
}

/** Create a fresh, empty accessor state (no filters, no ordering, no includes). */
export function emptyAccessorState(): IdbAccessorState {
  return {
    filters: [],
    includes: {},
  };
}

/** Return a shallow-merged copy of `state` with the given overrides applied. */
export function mergeAccessorState(state: IdbAccessorState, overrides: Partial<IdbAccessorState>): IdbAccessorState {
  return { ...state, ...overrides };
}
