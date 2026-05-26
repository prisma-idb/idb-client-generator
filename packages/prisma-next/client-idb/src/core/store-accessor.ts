import { AsyncIterableResult } from "@prisma-next/framework-components/runtime";
import type { PlanMeta } from "@prisma-next/contract/types";
import type { IdbFilterExpr, IdbQueryPlan } from "@prisma-next-idb/adapter-idb/runtime";
import type {
  IdbCreateAst,
  IdbDeleteAst,
  IdbFindManyAst,
  IdbFindUniqueAst,
} from "@prisma-next-idb/adapter-idb/runtime";
import { andExpr, evaluateFilter, shorthandToFilterExpr } from "@prisma-next-idb/adapter-idb/runtime";
import type { IdbRowComparator } from "@prisma-next-idb/driver-idb/runtime";
import {
  type CreateInput,
  type DefaultModelRow,
  type IdbContract,
  type IncludeSpec,
  type IncludedRow,
  type KeyType,
  type NoIncludes,
  type OrderBySpec,
  type ReferenceRelKeys,
  type WhereFilter,
  getStoreName,
} from "./types";
import { createModelAccessor, type IdbModelAccessor } from "./model-accessor";
import { type IdbAccessorState, emptyAccessorState, mergeAccessorState } from "./store-state";
import type { IdbQueryExecutor } from "./executor";
import { loadRelation } from "./relation-loader";

/** Callback form of `.where(fn)` — receives the typed model accessor proxy. */
export type WhereCallback<TContract, ModelName extends string> = (
  m: IdbModelAccessor<TContract, ModelName>
) => IdbFilterExpr;

// ── Interface ─────────────────────────────────────────────────────────────────

/**
 * Immutable query-builder for a single IDB object store.
 *
 * Each method that narrows the query (`.where()`, `.take()`, etc.) returns a
 * new, independent accessor instance — the original is never mutated. This
 * mirrors the `MongoCollection` pattern from `@prisma-next/2-mongo-family`.
 *
 * @template TContract   - The full IDB contract (with or without type maps).
 * @template ModelName   - The model (store) this accessor targets.
 * @template TIncludes   - Tracks which relations have been included via
 *   `.include()` calls, so the return type widens progressively.
 */
export interface IdbStoreAccessor<
  TContract,
  ModelName extends string,
  TIncludes extends IncludeSpec<TContract, ModelName> = NoIncludes,
> {
  /**
   * Add a filter (ANDed with any previous `.where()` calls).
   *
   * Two forms:
   *
   * - **Shorthand**: `where({ field: value })` — multi-key shorthand
   *   objects compose as AND. `null` values become null-checks rather
   *   than literal-null equalities so absent fields match.
   * - **Callback**: `where((m) => m.field.op(value))` — receives the
   *   typed model accessor proxy and returns an `IdbFilterExpr` built
   *   via the operator surface. Combinators (`and`, `or`, `not` from
   *   `@prisma-next-idb/client-idb/orm`) compose nodes.
   */
  where(
    filter: WhereFilter<TContract, ModelName> | WhereCallback<TContract, ModelName>
  ): IdbStoreAccessor<TContract, ModelName, TIncludes>;

  /** Set the sort order. Replaces any previous `.orderBy()` call. */
  orderBy(spec: OrderBySpec<TContract, ModelName>): IdbStoreAccessor<TContract, ModelName, TIncludes>;

  /** Limit the number of rows returned. */
  take(n: number): IdbStoreAccessor<TContract, ModelName, TIncludes>;

  /** Skip the first `n` rows (OFFSET). */
  skip(n: number): IdbStoreAccessor<TContract, ModelName, TIncludes>;

  /**
   * Include a reference relation in the returned rows.
   *
   * The relation is loaded via a single batch cursor scan after the main
   * query — O(1) round trips to IDB per included relation regardless of
   * the number of parent rows.
   *
   * The return type gains the relation field automatically.
   */
  include<K extends ReferenceRelKeys<TContract, ModelName>>(
    relation: K
  ): IdbStoreAccessor<TContract, ModelName, TIncludes & Record<K, true>>;

  /** Return all matching rows as an async iterable (also awaitable as `Row[]`). */
  all(): AsyncIterableResult<IncludedRow<TContract, ModelName, TIncludes>>;

  /** Return the first matching row, or `null` if none match. */
  first(): Promise<IncludedRow<TContract, ModelName, TIncludes> | null>;

  /**
   * Insert a record into the store and return the stored row.
   *
   * The primary key field is optional in `data` — pass it to use a
   * client-generated ID (`cuid`, `uuid`) or omit it for auto-increment stores.
   */
  create(data: CreateInput<TContract, ModelName>): Promise<DefaultModelRow<TContract, ModelName>>;

  /** Look up a single row by primary key. Returns `null` if not found. */
  findUnique(key: KeyType<TContract, ModelName>): Promise<DefaultModelRow<TContract, ModelName> | null>;

  /** Delete the row with the given primary key. */
  delete(key: KeyType<TContract, ModelName>): Promise<void>;
}

// ── Implementation ────────────────────────────────────────────────────────────

/**
 * Concrete immutable query builder.
 *
 * Internal details:
 * - All state is in `#state` (filters, orderBy, skip, take, includes).
 * - Builder methods clone via `#clone()` — O(1) copies since state is
 *   structurally shared.
 * - `all()` materialises the main rows first, then batch-loads each included
 *   relation before yielding (necessary for batch FK strategy).
 */
export class IdbStoreAccessorImpl<
  TContract extends IdbContract,
  ModelName extends string,
  TIncludes extends IncludeSpec<TContract, ModelName> = NoIncludes,
> implements IdbStoreAccessor<TContract, ModelName, TIncludes> {
  readonly #contract: TContract;
  readonly #modelName: ModelName;
  readonly #executor: IdbQueryExecutor;
  readonly #storeName: string;
  readonly #state: IdbAccessorState;
  readonly #newGroupingKey: () => string;

  constructor(
    contract: TContract,
    modelName: ModelName,
    executor: IdbQueryExecutor,
    state?: IdbAccessorState,
    newGroupingKey?: () => string
  ) {
    this.#contract = contract;
    this.#modelName = modelName;
    this.#executor = executor;
    this.#storeName = getStoreName(contract, modelName);
    this.#state = state ?? emptyAccessorState();
    // Default: per-instance counter (single client; avoids module-level interleaving).
    let _key = 0;
    this.#newGroupingKey = newGroupingKey ?? (() => `idb-op-${++_key}`);
  }

  // ── Builder methods ───────────────────────────────────────────────────────

  where(
    filter: WhereFilter<TContract, ModelName> | WhereCallback<TContract, ModelName>
  ): IdbStoreAccessor<TContract, ModelName, TIncludes> {
    const expr =
      typeof filter === "function"
        ? filter(createModelAccessor<TContract, ModelName>())
        : shorthandToFilterExpr(filter as Record<string, unknown>);
    // An empty shorthand object (or one with only undefined values) lifts
    // to `undefined` — keep the existing filter list untouched so chained
    // `.where({})` calls don't produce noisy AND nodes.
    if (expr === undefined) return this.#clone({});
    return this.#clone({ filters: [...this.#state.filters, expr] });
  }

  orderBy(spec: OrderBySpec<TContract, ModelName>): IdbStoreAccessor<TContract, ModelName, TIncludes> {
    return this.#clone({ orderBy: spec as Record<string, "asc" | "desc"> });
  }

  take(n: number): IdbStoreAccessor<TContract, ModelName, TIncludes> {
    return this.#clone({ take: n });
  }

  skip(n: number): IdbStoreAccessor<TContract, ModelName, TIncludes> {
    return this.#clone({ skip: n });
  }

  include<K extends ReferenceRelKeys<TContract, ModelName>>(
    relation: K
  ): IdbStoreAccessor<TContract, ModelName, TIncludes & Record<K, true>> {
    const newState = mergeAccessorState(this.#state, {
      includes: { ...this.#state.includes, [relation]: true as const },
    });
    // The new instance is identical at runtime; the narrowed TIncludes type is
    // only a compile-time distinction — so an `as unknown as` cast is safe.
    return new IdbStoreAccessorImpl(
      this.#contract,
      this.#modelName,
      this.#executor,
      newState,
      this.#newGroupingKey
    ) as unknown as IdbStoreAccessorImpl<TContract, ModelName, TIncludes & Record<K, true>>;
  }

  // ── Execution methods ─────────────────────────────────────────────────────

  all(): AsyncIterableResult<IncludedRow<TContract, ModelName, TIncludes>> {
    const groupingKey = this.#newGroupingKey();
    // Capture the private fields needed inside the generator. Private names
    // must be accessed on `this`, so we bind the methods to keep them callable
    // without aliasing `this` (no-this-alias).
    const buildScanPlan = this.#buildScanPlan.bind(this);
    const executorExecute = this.#executor.execute.bind(this.#executor);
    const applyIncludes = this.#applyIncludes.bind(this);
    return new AsyncIterableResult(
      (async function* (): AsyncGenerator<IncludedRow<TContract, ModelName, TIncludes>, void, unknown> {
        // 1. Run the main cursor scan and materialise rows.
        const scanPlan = buildScanPlan<Record<string, unknown>>(groupingKey);
        const rows: Record<string, unknown>[] = [];
        for await (const row of executorExecute(scanPlan)) {
          rows.push(row);
        }

        // 2. Batch-load any included relations.
        const withIncludes = await applyIncludes(rows, groupingKey);

        // 3. Yield the merged rows.
        for (const row of withIncludes) {
          yield row as IncludedRow<TContract, ModelName, TIncludes>;
        }
      })()
    );
  }

  async first(): Promise<IncludedRow<TContract, ModelName, TIncludes> | null> {
    return this.take(1).all().first();
  }

  async create(data: CreateInput<TContract, ModelName>): Promise<DefaultModelRow<TContract, ModelName>> {
    const record = data as Record<string, unknown>;
    const groupingKey = this.#newGroupingKey();
    const meta = this.#planMeta(groupingKey);
    const ast: IdbCreateAst = { kind: "create", modelName: this.#modelName, data: record };
    const plan: IdbQueryPlan<Record<string, unknown>> = {
      meta,
      ast,
      idbPlan: { meta, kind: "put", storeName: this.#storeName, record },
    };
    // The IDB driver echoes the stored record back as the single result row.
    for await (const row of this.#executor.execute(plan)) {
      return row as DefaultModelRow<TContract, ModelName>;
    }
    // Fallback: driver yielded no rows (shouldn't happen for `put`).
    return record as DefaultModelRow<TContract, ModelName>;
  }

  async findUnique(key: KeyType<TContract, ModelName>): Promise<DefaultModelRow<TContract, ModelName> | null> {
    const groupingKey = this.#newGroupingKey();
    const meta = this.#planMeta(groupingKey);
    const ast: IdbFindUniqueAst = { kind: "findUnique", modelName: this.#modelName, key };
    const plan: IdbQueryPlan<Record<string, unknown>> = {
      meta,
      ast,
      idbPlan: { meta, kind: "key-get", storeName: this.#storeName, key: key as IDBValidKey },
    };
    for await (const row of this.#executor.execute(plan)) {
      return row as DefaultModelRow<TContract, ModelName>;
    }
    return null;
  }

  async delete(key: KeyType<TContract, ModelName>): Promise<void> {
    const groupingKey = this.#newGroupingKey();
    const meta = this.#planMeta(groupingKey);
    const ast: IdbDeleteAst = { kind: "delete", modelName: this.#modelName, key };
    const plan: IdbQueryPlan<Record<string, unknown>> = {
      meta,
      ast,
      idbPlan: { meta, kind: "delete", storeName: this.#storeName, key: key as IDBValidKey },
    };
    // `delete` yields no rows; drain via toArray() to execute the plan.
    await this.#executor.execute(plan).toArray();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  #buildScanPlan<Row>(groupingKey: string): IdbQueryPlan<Row> {
    const combined = this.#combinedFilterExpr();
    const filter = combined !== undefined ? (row: Record<string, unknown>) => evaluateFilter(combined, row) : undefined;
    const comparator = this.#buildComparator();
    const meta = this.#planMeta(groupingKey);
    const ast: IdbFindManyAst = {
      kind: "findMany",
      modelName: this.#modelName,
      ...(combined !== undefined ? { where: combined } : {}),
      ...(this.#state.orderBy !== undefined ? { orderBy: this.#state.orderBy as Record<string, "asc" | "desc"> } : {}),
      ...(this.#state.skip !== undefined ? { skip: this.#state.skip } : {}),
      ...(this.#state.take !== undefined ? { take: this.#state.take } : {}),
    };
    // exactOptionalPropertyTypes: spread conditionally to avoid `undefined`
    // values in optional fields.
    return {
      meta,
      ast,
      idbPlan: {
        meta,
        kind: "cursor-scan" as const,
        storeName: this.#storeName,
        ...(filter !== undefined ? { filter } : {}),
        ...(comparator !== undefined ? { comparator } : {}),
        ...(this.#state.skip !== undefined ? { skip: this.#state.skip } : {}),
        ...(this.#state.take !== undefined ? { take: this.#state.take } : {}),
      },
    } as IdbQueryPlan<Row>;
  }

  /**
   * Combine all accumulated filter expressions with AND.
   *
   * Returns `undefined` when no filter has been installed so the
   * driver can skip building a row filter closure (a small perf and
   * readability win on `.all()` paths).
   */
  #combinedFilterExpr(): IdbFilterExpr | undefined {
    const filters = this.#state.filters;
    if (filters.length === 0) return undefined;
    if (filters.length === 1) return filters[0]!;
    return andExpr(filters);
  }

  #buildComparator(): IdbRowComparator | undefined {
    if (this.#state.orderBy === undefined) return undefined;
    const orderBy = this.#state.orderBy;
    return (a: Record<string, unknown>, b: Record<string, unknown>): number => {
      for (const [field, dir] of Object.entries(orderBy)) {
        const av = a[field];
        const bv = b[field];
        if (av === bv) continue;
        // Values are primitives (strings, numbers, dates) in practice.
        const cmp = (av as string | number) < (bv as string | number) ? -1 : 1;
        return dir === "desc" ? -cmp : cmp;
      }
      return 0;
    };
  }

  async #applyIncludes(rows: Record<string, unknown>[], groupingKey: string): Promise<Record<string, unknown>[]> {
    const relNames = Object.keys(this.#state.includes);
    if (relNames.length === 0) return rows;
    let result = rows;
    for (const relName of relNames) {
      result = await loadRelation(relName, result, this.#contract, this.#modelName, this.#executor, groupingKey);
    }
    return result;
  }

  #planMeta(groupingKey: string): PlanMeta {
    return {
      target: "idb",
      storageHash: this.#contract.storage.storageHash,
      lane: "idb-orm",
      annotations: { groupingKey },
    };
  }

  #clone(overrides: Partial<IdbAccessorState>): IdbStoreAccessorImpl<TContract, ModelName, TIncludes> {
    return new IdbStoreAccessorImpl(
      this.#contract,
      this.#modelName,
      this.#executor,
      mergeAccessorState(this.#state, overrides),
      this.#newGroupingKey
    );
  }
}
