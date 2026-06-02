import { AsyncIterableResult } from "@prisma-next/framework-components/runtime";
import type { PlanMeta } from "@prisma-next/contract/types";
import type { IdbFilterExpr, IdbQueryPlan } from "@prisma-next-idb/adapter-idb/runtime";
import type {
  IdbCountAst,
  IdbCreateAst,
  IdbCreateAllAst,
  IdbDeleteAst,
  IdbDeleteAllAst,
  IdbFindManyAst,
  IdbFindUniqueAst,
  IdbUpdateAst,
  IdbUpdateAllAst,
  IdbUpsertAst,
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
  type MutationCreateInput,
  type MutationUpdateInput,
  type NoIncludes,
  type OrderBySpec,
  type PatchInput,
  type ReferenceRelKeys,
  type WhereFilter,
  getKeyPath,
  getStoreName,
} from "./types";
import { createModelAccessor, type IdbModelAccessor } from "./model-accessor";
import { type IdbAccessorState, emptyAccessorState, mergeAccessorState } from "./store-state";
import type { IdbQueryExecutor } from "./executor";
import { loadRelation } from "./relation-loader";
import {
  executeNestedCreateMutation,
  executeNestedUpdateMutation,
  hasNestedMutationCallbacks,
  requireTransactionExecutor,
} from "./mutation-executor";

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
   *
   * Relation fields accept a mutation callback:
   * `posts: (rel) => rel.create([...])` or `author: (rel) => rel.connect({ id })`.
   * When any relation callback is present, all writes are wrapped in a single
   * multi-store IDB transaction (requires IdbRuntime, not a plain executor).
   */
  create(data: MutationCreateInput<TContract, ModelName>): Promise<DefaultModelRow<TContract, ModelName>>;

  /** Look up a single row by primary key. Returns `null` if not found. */
  findUnique(key: KeyType<TContract, ModelName>): Promise<DefaultModelRow<TContract, ModelName> | null>;

  /** Delete the row with the given primary key. */
  delete(key: KeyType<TContract, ModelName>): Promise<void>;

  /**
   * Update the first row matching the accumulated `.where()` filter.
   * Returns the merged row, or `null` if no row matches.
   *
   * Relation fields accept `connect` or `disconnect` callbacks. When any
   * relation callback is present, all writes run in a single multi-store
   * IDB transaction (requires IdbRuntime).
   */
  update(patch: MutationUpdateInput<TContract, ModelName>): Promise<DefaultModelRow<TContract, ModelName> | null>;

  /**
   * Update all rows matching the accumulated `.where()` filter and return
   * them as an `AsyncIterableResult` (also awaitable as `Row[]`).
   */
  updateAll(patch: PatchInput<TContract, ModelName>): AsyncIterableResult<DefaultModelRow<TContract, ModelName>>;

  /**
   * Update all rows matching the accumulated `.where()` filter.
   * Returns the count of updated rows.
   */
  updateCount(patch: PatchInput<TContract, ModelName>): Promise<number>;

  /**
   * Insert or update a single record.
   *
   * - If a row matching `where` exists: shallow-merge `update` onto it and
   *   return the merged row.
   * - If no matching row exists: insert `create` and return it.
   */
  upsert(args: {
    create: CreateInput<TContract, ModelName>;
    update: PatchInput<TContract, ModelName>;
    where: WhereFilter<TContract, ModelName>;
  }): Promise<DefaultModelRow<TContract, ModelName>>;

  /**
   * Insert multiple records in a single atomic transaction.
   * Returns all inserted rows as an `AsyncIterableResult`.
   */
  createAll(data: CreateInput<TContract, ModelName>[]): AsyncIterableResult<DefaultModelRow<TContract, ModelName>>;

  /**
   * Insert multiple records in a single atomic transaction.
   * Returns the count of inserted rows.
   */
  createCount(data: CreateInput<TContract, ModelName>[]): Promise<number>;

  /**
   * Delete all rows matching the accumulated `.where()` filter.
   * Returns the deleted rows as an `AsyncIterableResult`.
   */
  deleteAll(): AsyncIterableResult<DefaultModelRow<TContract, ModelName>>;

  /**
   * Delete all rows matching the accumulated `.where()` filter.
   * Returns the count of deleted rows.
   */
  deleteCount(): Promise<number>;

  /**
   * Count all rows matching the accumulated `.where()` filter.
   * With no filter, counts all rows in the store.
   *
   * **Note — `skip`/`take` are respected**: unlike Prisma's SQL `count()`,
   * which ignores pagination, this implementation reuses the same cursor-scan
   * plan as `all()`. That means `where(...).take(5).count()` returns at most 5,
   * not the total number of matching rows. Use `where(...).count()` without
   * `take`/`skip` when you need an unbounded total.
   */
  count(): Promise<number>;
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

  async create(data: MutationCreateInput<TContract, ModelName>): Promise<DefaultModelRow<TContract, ModelName>> {
    const record = data as Record<string, unknown>;

    if (hasNestedMutationCallbacks(this.#contract, this.#modelName, record)) {
      const row = await executeNestedCreateMutation({
        executor: requireTransactionExecutor(this.#executor),
        contract: this.#contract,
        modelName: this.#modelName,
        data: record,
      });
      return row as DefaultModelRow<TContract, ModelName>;
    }

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

  async update(
    patch: MutationUpdateInput<TContract, ModelName>
  ): Promise<DefaultModelRow<TContract, ModelName> | null> {
    const patchRecord = patch as Record<string, unknown>;

    if (hasNestedMutationCallbacks(this.#contract, this.#modelName, patchRecord)) {
      const row = await executeNestedUpdateMutation({
        executor: requireTransactionExecutor(this.#executor),
        contract: this.#contract,
        modelName: this.#modelName,
        filters: this.#state.filters,
        data: patchRecord,
      });
      return row as DefaultModelRow<TContract, ModelName> | null;
    }

    const groupingKey = this.#newGroupingKey();
    const combined = this.#combinedFilterExpr();
    const filter = combined !== undefined ? (row: Record<string, unknown>) => evaluateFilter(combined, row) : undefined;
    const meta = this.#planMeta(groupingKey);
    const ast: IdbUpdateAst = {
      kind: "update",
      modelName: this.#modelName,
      patch: patchRecord,
      ...(combined !== undefined ? { where: combined } : {}),
    };
    const plan: IdbQueryPlan<Record<string, unknown>> = {
      meta,
      ast,
      idbPlan: {
        meta,
        kind: "scan-write",
        storeName: this.#storeName,
        write: "put-merged",
        patch: patchRecord,
        take: 1,
        ...(filter !== undefined ? { filter } : {}),
      },
    };
    for await (const row of this.#executor.execute(plan)) {
      return row as DefaultModelRow<TContract, ModelName>;
    }
    return null;
  }

  updateAll(patch: PatchInput<TContract, ModelName>): AsyncIterableResult<DefaultModelRow<TContract, ModelName>> {
    const groupingKey = this.#newGroupingKey();
    const combined = this.#combinedFilterExpr();
    const filter = combined !== undefined ? (row: Record<string, unknown>) => evaluateFilter(combined, row) : undefined;
    const meta = this.#planMeta(groupingKey);
    const storeName = this.#storeName;
    const modelName = this.#modelName;
    const patchRecord = patch as Record<string, unknown>;
    const executorExecute = this.#executor.execute.bind(this.#executor);
    return new AsyncIterableResult(
      (async function* (): AsyncGenerator<DefaultModelRow<TContract, ModelName>, void, unknown> {
        const ast: IdbUpdateAllAst = {
          kind: "updateAll",
          modelName,
          patch: patchRecord,
          ...(combined !== undefined ? { where: combined } : {}),
        };
        const plan: IdbQueryPlan<Record<string, unknown>> = {
          meta,
          ast,
          idbPlan: {
            meta,
            kind: "scan-write",
            storeName,
            write: "put-merged",
            patch: patchRecord,
            ...(filter !== undefined ? { filter } : {}),
          },
        };
        for await (const row of executorExecute(plan)) {
          yield row as DefaultModelRow<TContract, ModelName>;
        }
      })()
    );
  }

  async updateCount(patch: PatchInput<TContract, ModelName>): Promise<number> {
    return (await this.updateAll(patch).toArray()).length;
  }

  async upsert(args: {
    create: CreateInput<TContract, ModelName>;
    update: PatchInput<TContract, ModelName>;
    where: WhereFilter<TContract, ModelName>;
  }): Promise<DefaultModelRow<TContract, ModelName>> {
    const existing = await this.where(args.where).first();
    if (!existing) {
      // A bare CreateInput (no relation callbacks) is always a valid
      // MutationCreateInput; the generic intersection can't be proven here.
      return this.create(args.create as MutationCreateInput<TContract, ModelName>);
    }
    const keyPath = getKeyPath(this.#contract, this.#modelName);
    const key = (existing as Record<string, unknown>)[keyPath] as IDBValidKey;
    const groupingKey = this.#newGroupingKey();
    const meta = this.#planMeta(groupingKey);
    const ast: IdbUpsertAst = {
      kind: "upsert",
      modelName: this.#modelName,
      create: args.create as Record<string, unknown>,
      update: args.update as Record<string, unknown>,
      where: args.where as Record<string, unknown>,
    };
    const plan: IdbQueryPlan<Record<string, unknown>> = {
      meta,
      ast,
      idbPlan: {
        meta,
        kind: "update",
        storeName: this.#storeName,
        key,
        patch: args.update as Record<string, unknown>,
      },
    };
    for await (const row of this.#executor.execute(plan)) {
      return row as DefaultModelRow<TContract, ModelName>;
    }
    return existing;
  }

  createAll(data: CreateInput<TContract, ModelName>[]): AsyncIterableResult<DefaultModelRow<TContract, ModelName>> {
    const groupingKey = this.#newGroupingKey();
    const meta = this.#planMeta(groupingKey);
    const records = data.map((d) => d as Record<string, unknown>);
    const ast: IdbCreateAllAst = { kind: "createAll", modelName: this.#modelName, data: records };
    const plan: IdbQueryPlan<Record<string, unknown>> = {
      meta,
      ast,
      idbPlan: {
        meta,
        kind: "batch",
        storeNames: [this.#storeName],
        ops: records.map((record) => ({ meta, kind: "put" as const, storeName: this.#storeName, record })),
      },
    };
    const executorExecute = this.#executor.execute.bind(this.#executor);
    return new AsyncIterableResult(
      (async function* (): AsyncGenerator<DefaultModelRow<TContract, ModelName>, void, unknown> {
        for await (const row of executorExecute(plan)) {
          yield row as DefaultModelRow<TContract, ModelName>;
        }
      })()
    );
  }

  async createCount(data: CreateInput<TContract, ModelName>[]): Promise<number> {
    return (await this.createAll(data).toArray()).length;
  }

  deleteAll(): AsyncIterableResult<DefaultModelRow<TContract, ModelName>> {
    const groupingKey = this.#newGroupingKey();
    const combined = this.#combinedFilterExpr();
    const filter = combined !== undefined ? (row: Record<string, unknown>) => evaluateFilter(combined, row) : undefined;
    const meta = this.#planMeta(groupingKey);
    const ast: IdbDeleteAllAst = {
      kind: "deleteAll",
      modelName: this.#modelName,
      ...(combined !== undefined ? { where: combined } : {}),
    };
    const storeName = this.#storeName;
    const executorExecute = this.#executor.execute.bind(this.#executor);
    return new AsyncIterableResult(
      (async function* (): AsyncGenerator<DefaultModelRow<TContract, ModelName>, void, unknown> {
        const plan: IdbQueryPlan<Record<string, unknown>> = {
          meta,
          ast,
          idbPlan: {
            meta,
            kind: "scan-write",
            storeName,
            write: "delete",
            ...(filter !== undefined ? { filter } : {}),
          },
        };
        for await (const row of executorExecute(plan)) {
          yield row as DefaultModelRow<TContract, ModelName>;
        }
      })()
    );
  }

  async deleteCount(): Promise<number> {
    return (await this.deleteAll().toArray()).length;
  }

  async count(): Promise<number> {
    const groupingKey = this.#newGroupingKey();
    const scanPlan = this.#buildScanPlan<Record<string, unknown>>(groupingKey);
    // Override the AST kind for middleware introspection — the idbPlan stays cursor-scan.
    const scanAst = scanPlan.ast;
    const ast: IdbCountAst = {
      kind: "count",
      modelName: this.#modelName,
      ...(scanAst?.kind === "findMany" && scanAst.where !== undefined ? { where: scanAst.where } : {}),
    };
    const plan: IdbQueryPlan<Record<string, unknown>> = { ...scanPlan, ast };
    let n = 0;
    for await (const _ of this.#executor.execute(plan)) {
      n++;
    }
    return n;
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
