## Status

| Phase | Description                                                            | Status                                |
| ----- | ---------------------------------------------------------------------- | ------------------------------------- |
| 1     | Codec system (`target-idb`)                                            | ✅ Done                               |
| 2     | Runtime driver (`driver-idb`)                                          | ✅ Done                               |
| 3     | Query lowering (`adapter-idb`)                                         | ✅ Done                               |
| 4     | Control plane manifest operations (`family-idb`)                       | ✅ Done — committed `234ebc7`         |
| 5     | Migration infrastructure (`target-idb/control`)                        | ✅ Done                               |
| 6     | IDB ORM lane (`client-idb`) + runtime (`runtime-idb`)                  | 🚧 MVP done, feature gap phases below |
| 6.1   | Filter expression AST + operator API                                   | ❌ Not started                        |
| 6.2   | Missing CRUD terminals (update, upsert, createMany, deleteMany, count) | ❌ Not started                        |
| 6.3   | Multi-store transaction support                                        | ❌ Not started                        |
| 6.4   | Nested relation writes (create/connect/disconnect)                     | ❌ Not started                        |
| 6.5   | Include refinement (where/orderBy/take inside include)                 | ❌ Not started                        |
| 6.6   | Aggregate / groupBy                                                    | ❌ Not started                        |
| 6.7   | Select projection                                                      | ❌ Not started                        |
| 7     | Outbox sync                                                            | ❌ Not started                        |

---

## Phase 5 — Migration infrastructure (target-idb/control) ✅ Done

**Goal:** Make `target-idb` a `MigratableTargetDescriptor`. The target gains a planner that diffs two `IdbSchemaIR`s into an ordered DDL op sequence, and a runner that executes that sequence inside IndexedDB's `upgradeneeded` callback.

**Completed additions beyond the original plan:**

- Planner includes creation of the `_prisma_next_marker` object store on first migration
- Runner writes the contract marker record (`storageHash`, `profileHash`, `updatedAt`) after DDL succeeds
- Driver exposes `MARKER_STORE_NAME` and `IdbMarkerRecord` so the runtime can read/verify the marker
- Runtime's `verifyMarker()` cross-checks the live marker against the contract before query execution

### Mental model

```
Planner:  fromContract → IdbSchemaIR
          contract     → IdbSchemaIR
          diff(from, to) → IdbDdlOp[]
          wrap → IdbMigrationPlanWithAuthoring

Runner:   factory.open(dbName, targetVersion)
          upgradeneeded → applyDdlOps(db, tx, ops)
          resolve → MigrationRunnerResult
```

The **planner** owns schema diffing. The **runner** owns DDL execution. The **manifest** (`idbVersion`) is owned by the caller (CLI or family instance) — the runner does not touch it. After a successful `runner.execute()`, the caller increments `idbVersion` in the manifest and calls `family.sign()`.

### Version tracking

- `IdbManifest` gains `idbVersion?: number` (integer, 1, 2, 3…)
- Caller computes `targetVersion = (manifest.idbVersion ?? 0) + 1` before building the migration driver
- IDB's native version-change mechanism is used (`factory.open(name, targetVersion)`)
- On success, caller writes `idbVersion: targetVersion` back to the manifest

> **Note (not yet implemented):** `IdbManifest` does not yet have an `idbVersion` field. The current implementation relies solely on `storageHash` comparison via `verifyMarker()` for drift detection. The `idbVersion` counter and its manifest field are still needed to correctly compute `targetVersion` for the migration runner — without it, the runner always opens at version 1 and DDL only fires on a fresh database. This is the next thing to add before the migration runner can be used in a real app flow.

### New files in `target-idb/src/core/`

| File                     | What it does                                                                                                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migration-factories.ts` | `IdbDdlOp` discriminated union (`CreateObjectStoreOp`, `DropObjectStoreOp`, `CreateIndexOp`, `DropIndexOp`) + factory functions. Each op implements `MigrationPlanOperation` (`id`, `label`, `operationClass`).                                                             |
| `schema-diff.ts`         | `diffIdbSchema(from, to): IdbDdlOp[]` — ordered diff, creates before drops, stores before indexes.                                                                                                                                                                          |
| `migration-driver.ts`    | `IdbMigrationControlDriver` extends `ControlDriverInstance<"idb","idb">` with `{ dbName, factory: IDBFactory, targetVersion: number }`. `IdbMigrationControlDriverDescriptor.create({...})` + `extractMigrationDriver()`.                                                   |
| `migration-runner.ts`    | `IdbMigrationRunner implements MigrationRunner<"idb","idb">`. Extracts driver, filters ops by policy, opens DB at `targetVersion`, runs DDL in `upgradeneeded`.                                                                                                             |
| `migration-planner.ts`   | `IdbMigrationPlanner implements MigrationPlanner<"idb","idb">`. `plan()` converts contracts to schema IR, diffs them, returns `IdbMigrationPlanWithAuthoring`. `emptyMigration()` returns a stub plan. `contractToIdbSchema()` is exported for use in `descriptor-meta.ts`. |

### Updated files

| File                                     | Change                                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `target-idb/tsconfig.json`               | Add `"DOM"` to `lib` (needed for `IDBFactory`, `IDBDatabase`, `IDBTransaction` etc.)                                                                    |
| `target-idb/tsdown.config.ts`            | Add `src/exports/migration.ts` as a build entry                                                                                                         |
| `target-idb/package.json`                | Add `"./migration": "./dist/migration.mjs"` export                                                                                                      |
| `target-idb/src/core/descriptor-meta.ts` | No change — migrations capability goes on the control descriptor                                                                                        |
| `target-idb/src/exports/control.ts`      | Add `migrations` capability (`createPlanner`, `createRunner`, `contractToSchema`); change `satisfies` type to `MigratableTargetDescriptor<"idb","idb">` |
| `target-idb/src/exports/migration.ts`    | New — re-exports DDL op factories + types for user-authored migration files                                                                             |
| `family-idb/src/core/manifest.ts`        | Add `idbVersion?: number` to `IdbManifest`                                                                                                              |

### Key design constraints

- **DDL-only-in-upgrade**: IDB DDL can ONLY run inside `upgradeneeded`. The runner opens a version-change transaction by bumping the version number.
- **No manifest writes from runner**: The runner is a pure executor. Manifest updates are the caller's responsibility.
- **Policy filtering**: The runner filters ops by `policy.allowedOperationClasses` before executing. Additive ops pass a default policy; destructive require explicit allowance.
- **`exactOptionalPropertyTypes`**: All optional IDB API options (`autoIncrement`, `multiEntry`) use conditional spreads, never `undefined` assignment.

---

## Phase 6 — IDB ORM lane (`client-idb`) + runtime (`runtime-idb`) + demo app

**Status:** 🚧 Packages are implemented and tested. Demo app is pending.

### `runtime-idb` (`@prisma-next-idb/runtime-idb`)

**Goal:** Wire the adapter and driver into a `RuntimeCore` subclass so the user gets a single `execute(plan)` call that handles lowering, execution, marker verification, and middleware.

**Key components:**

| File                | What it does                                                                                                                                                                                                                                                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idb-runtime.ts`    | `IdbRuntimeImpl extends RuntimeCore<IdbQueryPlan, IdbPlanBody, IdbMiddleware>`. Overrides `lower()` (threads contract through adapter), `runDriver()` (delegates to driver), `execute()` (identity pass-through), `close()` (closes IDB connection). Exposes `verifyMarker()` — reads `_prisma_next_marker` store and compares `storageHash` against contract. |
| `idb-middleware.ts` | `IdbMiddleware extends RuntimeMiddleware<IdbPlanBody>` with `family: "idb"` discriminant. Supports `beforeExecute`, `onRow`, `afterExecute` hooks.                                                                                                                                                                                                             |

**Constructor behavior:**

- When `ctx` is not provided, builds a `RuntimeMiddlewareContext` from the contract (with `mode: "permissive"`, log stubs, `now: Date.now`)
- When `ctx` is provided, uses it as-is — does not derive from contract

**`verifyMarker()` flow:**

1. Calls `driver.readMarker()` → `IdbMarkerRecord | null`
2. If null → returns `false` (database never initialised or pre-marker)
3. Compares `marker.storageHash` against `contract.storage.storageHash`
4. Match → `true`, mismatch → `false` (schema drift — run migrations)

### `client-idb` (`@prisma-next-idb/client-idb`)

**Goal:** `idbOrm({ contract, executor })` — a typed per-store client following the Mongo ORM pattern.

**Key components:**

| File                 | What it does                                                                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idb-orm.ts`         | `idbOrm()` factory. Reads `contract.roots`, creates one `IdbStoreAccessorImpl` per root model. Returns `IdbOrmClient<TContract>` — a mapped type where each root key becomes an `IdbStoreAccessor`.                                           |
| `store-accessor.ts`  | `IdbStoreAccessorImpl` — typed per-model query builder. Methods: `create(data)`, `all()`, `where(filter)`, `first(filter?)`, `findUnique(key)`, `delete(key)`. Every method builds an `IdbQueryPlan` with a `groupingKey` and optional `ast`. |
| `executor.ts`        | Thin `IdbQueryExecutor` interface: `execute<Row>(plan: IdbQueryPlan<Row>): AsyncIterableResult<Row>`. Structurally satisfied by `IdbRuntime`.                                                                                                 |
| `relation-loader.ts` | `include()` support — loads related records via foreign key lookups.                                                                                                                                                                          |
| `store-state.ts`     | Per-store `groupingKey` counter — generates `"idb-op-N"` keys threaded into every plan's meta.                                                                                                                                                |
| `types.ts`           | `IdbContract`, `WhereFilter`, `CreateInput`, `KeyType`, `DefaultModelRow` etc.                                                                                                                                                                |

**Plan enrichment (added to adapter-idb):**

| File               | What it does                                                                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idb-query-ast.ts` | `IdbQueryAst` union type — `findMany`, `findUnique`, `create`, `delete` AST nodes. Attached as `plan.ast` by the store accessor so middleware can inspect query intent. |

### Mongo ORM pattern (the model to follow)

```ts
// @prisma-next/mongo-orm pattern:
const client = mongoOrm({ contract, executor });
// executor = { execute<Row>(plan): AsyncIterableResult<Row> }
client.User.create({ name: "Alice" });
client.User.where({ id: "u1" }).first();
```

Our IDB ORM follows the same pattern:

```ts
import { idbOrm } from "@prisma-next-idb/client-idb/orm";
import { createIdbRuntime } from "@prisma-next-idb/runtime-idb/runtime";

const runtime = createIdbRuntime({ adapter, driver, contract });
await runtime.verifyMarker(); // check schema match

const db = idbOrm({ contract, executor: runtime });
await db.users.create({ name: "Alice" });
const users = await db.users.all();
```

### MVP operations (implemented)

- `create` — IDB `add()` operation with client-generated id
- `all` — full cursor scan
- `where` + `first` — cursor scan with in-memory filter
- `findUnique` — exact key lookup
- `delete` — key-based deletion

### What's done in Phase 6 (MVP)

- `create(data)` — IDB `put()` with caller-generated ID
- `all()` — full cursor scan
- `where(filter)` — equality-only in-memory filter (ANDed)
- `first()` — cursor scan taking 1
- `findUnique(key)` — IDB key lookup
- `delete(key)` — single-key IDB delete
- `include(relName)` — batch FK relation load (one level, no refinement)
- `orderBy(spec)` — in-memory comparator
- `take(n)` / `skip(n)` — inline during cursor scan

---

## Parallel Testing Strategy

Each Phase 6.x implementation step is developed alongside a matching test file in `apps/prisma-next-usage`. Tests in the demo app provide integration-level coverage (contract → idbOrm → runtime → driver → IDB) that the package unit tests cannot fully cover.

### Mapping: phase → test file

| Phase | `apps/prisma-next-usage/test/` file(s)                                                                                                                                                              |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1   | `filterConditions/operators.spec.ts`, `filterConditions/combinators.spec.ts`                                                                                                                        |
| 6.2   | `modelQueries/update.spec.ts`, `modelQueries/updateMany.spec.ts`, `modelQueries/upsert.spec.ts`, `modelQueries/createMany.spec.ts`, `modelQueries/deleteMany.spec.ts`, `modelQueries/count.spec.ts` |
| 6.3   | `atomicOperations/multiStoreTransaction.spec.ts`                                                                                                                                                    |
| 6.4   | `nestedWrites/create.spec.ts`, `nestedWrites/connect.spec.ts`, `nestedWrites/disconnect.spec.ts`                                                                                                    |
| 6.5   | `includeRefinement/whereInsideInclude.spec.ts`, `includeRefinement/scalarInclude.spec.ts`                                                                                                           |
| 6.6   | `modelQueries/aggregate.spec.ts`, `modelQueries/groupBy.spec.ts`                                                                                                                                    |
| 6.7   | `modelQueries/select.spec.ts`                                                                                                                                                                       |

**Already covered** (from demo app setup): `modelQueries/create.spec.ts`, `modelQueries/findFirst.spec.ts`, `modelQueries/findUnique.spec.ts`, `modelQueries/delete.spec.ts`, `filterConditions/equality.spec.ts`, `modelQueryOptions/orderBy.spec.ts`, `modelQueryOptions/take.spec.ts`, `modelQueryOptions/skip.spec.ts`, `nestedQueries/include.spec.ts`.

### Rule

Write the demo app test first (red), then implement the feature in the package (green). The demo app tests exercise the fully assembled stack; package unit tests (`client-idb/test/orm.test.ts`) cover edge cases and internal invariants in isolation.

---

## Phase 6.1 — Filter expression AST + operator API

**Goal:** Replace the equality-only `WhereFilter` with a full expression AST and a typed `IdbModelAccessor` proxy. After this phase a developer can write:

```ts
// Callback form with operators:
await db.posts.where((p) => p.views.gt(100)).all();
await db.users.where((u) => u.name.contains("Alice")).all();
await db.users.where((u) => and(u.age.gte(18), u.active.eq(true))).all();

// Shorthand still works (equality only, unchanged):
await db.users.where({ active: true }).all();
```

### Reference

Mongo ORM: `MongoFieldFilter`, `MongoAndExpr`, `MongoOrExpr`, `MongoNotExpr` (class-based frozen nodes).
SQL ORM: `BinaryExpr`, `AndExpr`, `OrExpr` from `sql-relational-core/ast` (class-based, codec trait-gated).

**IDB adaptation**: use **plain frozen objects** (not classes) — no visitor pattern needed, no codec traits. `evaluateFilter()` is a simple recursive function. All operators are always available on all fields (IDB stores native JS values, so numeric vs string comparison is governed by JS semantics, not codec metadata).

### New: `IdbFilterExpr` discriminated union (`adapter-idb/src/core/idb-filter-expr.ts`)

```ts
export type IdbFilterOp =
  | "eq"
  | "neq"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "in"
  | "notIn"
  | "contains"
  | "startsWith"
  | "endsWith";

export interface IdbFieldFilter {
  readonly kind: "field";
  readonly field: string;
  readonly op: IdbFilterOp;
  readonly value: unknown;
}
export interface IdbAndExpr {
  readonly kind: "and";
  readonly exprs: ReadonlyArray<IdbFilterExpr>;
}
export interface IdbOrExpr {
  readonly kind: "or";
  readonly exprs: ReadonlyArray<IdbFilterExpr>;
}
export interface IdbNotExpr {
  readonly kind: "not";
  readonly expr: IdbFilterExpr;
}
export interface IdbNullCheckExpr {
  readonly kind: "null-check";
  readonly field: string;
  readonly isNull: boolean;
}

export type IdbFilterExpr = IdbFieldFilter | IdbAndExpr | IdbOrExpr | IdbNotExpr | IdbNullCheckExpr;

// Factory helpers used by IdbFieldAccessor and shorthandToFilterExpr:
export const fieldFilter = (field: string, op: IdbFilterOp, value: unknown): IdbFieldFilter =>
  Object.freeze({ kind: "field", field, op, value });
export const andExpr = (exprs: ReadonlyArray<IdbFilterExpr>): IdbAndExpr =>
  Object.freeze({ kind: "and", exprs: Object.freeze([...exprs]) });
export const orExpr = (exprs: ReadonlyArray<IdbFilterExpr>): IdbOrExpr =>
  Object.freeze({ kind: "or", exprs: Object.freeze([...exprs]) });
export const notExpr = (expr: IdbFilterExpr): IdbNotExpr => Object.freeze({ kind: "not", expr });
export const nullCheckExpr = (field: string, isNull: boolean): IdbNullCheckExpr =>
  Object.freeze({ kind: "null-check", field, isNull });
```

### New: `evaluateFilter(expr, row)` (`adapter-idb/src/core/filter-eval.ts`)

Recursive function — no visitor. Used in `store-accessor.ts` to build the `IdbRowFilter` closure passed to the driver plan. The driver's `IdbRowFilter` type stays as `(row) => boolean`; the filter closure calls `evaluateFilter(combinedExpr, row)`.

```ts
export function evaluateFilter(expr: IdbFilterExpr, row: Record<string, unknown>): boolean;
```

String ops (`contains`, `startsWith`, `endsWith`) coerce field values with `String()` before comparing. `in`/`notIn` use `===` per element. All comparison ops use JS `<`/`>`/`<=`/`>=`.

### New: `shorthandToFilterExpr` helper (`adapter-idb/src/core/idb-filter-expr.ts`)

Mirrors `shorthandToWhereExpr` from `sql-orm-client/filters.ts`:

```ts
export function shorthandToFilterExpr(filters: Record<string, unknown>): IdbFilterExpr | undefined {
  const exprs: IdbFilterExpr[] = [];
  for (const [field, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (value === null) {
      exprs.push(nullCheckExpr(field, true));
      continue;
    }
    exprs.push(fieldFilter(field, "eq", value));
  }
  if (exprs.length === 0) return undefined;
  return exprs.length === 1 ? exprs[0] : andExpr(exprs);
}
```

### New: `IdbModelAccessor` proxy (`client-idb/src/core/model-accessor.ts`)

Mirrors `createModelAccessor()` from `sql-orm-client` but **without codec trait-gating**. A `Proxy` keyed on field names; each field returns an `IdbFieldAccessor<T>`:

```ts
// The typed surface (compile-time):
export type IdbFieldAccessor<T> = {
  eq(value: T): IdbFilterExpr;
  neq(value: T): IdbFilterExpr;
  gt(value: T): IdbFilterExpr;
  lt(value: T): IdbFilterExpr;
  gte(value: T): IdbFilterExpr;
  lte(value: T): IdbFilterExpr;
  in(values: T[]): IdbFilterExpr;
  notIn(values: T[]): IdbFilterExpr;
  contains(sub: string): IdbFilterExpr; // all fields (coerces to string at eval time)
  startsWith(sub: string): IdbFilterExpr;
  endsWith(sub: string): IdbFilterExpr;
  isNull(): IdbFilterExpr;
  isNotNull(): IdbFilterExpr;
};

// At runtime the Proxy get-trap creates this for any field name:
function createIdbFieldAccessor(field: string): IdbFieldAccessor<unknown> {
  return {
    eq: (value) => fieldFilter(field, "eq", value),
    neq: (value) => fieldFilter(field, "neq", value),
    gt: (value) => fieldFilter(field, "gt", value),
    lt: (value) => fieldFilter(field, "lt", value),
    gte: (value) => fieldFilter(field, "gte", value),
    lte: (value) => fieldFilter(field, "lte", value),
    in: (values) => fieldFilter(field, "in", values),
    notIn: (values) => fieldFilter(field, "notIn", values),
    contains: (sub) => fieldFilter(field, "contains", sub),
    startsWith: (sub) => fieldFilter(field, "startsWith", sub),
    endsWith: (sub) => fieldFilter(field, "endsWith", sub),
    isNull: () => nullCheckExpr(field, true),
    isNotNull: () => nullCheckExpr(field, false),
  };
}

// ModelAccessor<TContract, ModelName> maps each scalar field key → IdbFieldAccessor<FieldType>
export type IdbModelAccessor<TContract, ModelName extends string> = {
  readonly [K in keyof DefaultModelRow<TContract, ModelName>]: IdbFieldAccessor<
    DefaultModelRow<TContract, ModelName>[K]
  >;
};

export function createModelAccessor<TContract extends IdbContract, ModelName extends string>(): IdbModelAccessor<
  TContract,
  ModelName
> {
  return new Proxy({} as IdbModelAccessor<TContract, ModelName>, {
    get(_target, prop: string | symbol) {
      if (typeof prop !== "string") return undefined;
      return createIdbFieldAccessor(prop);
    },
  });
}
```

### New: `and()`, `or()`, `not()` user-facing helpers (`client-idb/src/core/filters.ts`)

```ts
export const and = (...exprs: IdbFilterExpr[]): IdbAndExpr => andExpr(exprs);
export const or = (...exprs: IdbFilterExpr[]): IdbOrExpr => orExpr(exprs);
export const not = (expr: IdbFilterExpr): IdbNotExpr => notExpr(expr);
```

### Changes to existing files

| File                             | Change                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store-state.ts`                 | `filters: ReadonlyArray<IdbFilterExpr>` (was `ReadonlyArray<Record<string, unknown>>`)                                                                                                                        |
| `store-accessor.ts`              | `where()` gains overload: `where(fn: (m: IdbModelAccessor<TContract, ModelName>) => IdbFilterExpr)`. Shorthand object form converts via `shorthandToFilterExpr()`. `#buildFilter()` calls `evaluateFilter()`. |
| `idb-query-ast.ts`               | `IdbFindManyAst.where` type → `IdbFilterExpr` (was `Record<string, unknown>`)                                                                                                                                 |
| `adapter-idb/exports/runtime.ts` | Re-export `IdbFilterExpr`, `IdbFieldFilter`, etc. and `evaluateFilter`                                                                                                                                        |
| `client-idb/exports/orm.ts`      | Re-export `IdbModelAccessor`, `IdbFieldAccessor`, `and`, `or`, `not`                                                                                                                                          |

> **Note**: `IdbRowFilter` on `IdbCursorScanPlan` stays as `(row) => boolean`. The accessor builds the closure using `evaluateFilter()` — the driver does not import `IdbFilterExpr`. This keeps `driver-idb` free of `adapter-idb` dependencies.

---

## Phase 6.2 — Missing CRUD terminals

**Goal:** Close the gap on the most-needed write operations. After this phase:

```ts
// update — chain after where()
await db.users.where({ id: "u1" }).update({ displayName: "New Name" });

// updateMany — updates all matching rows, returns count
const count = await db.users.where((u) => u.active.eq(false)).updateMany({ deletedAt: new Date() });

// upsert
await db.users.upsert({
  create: { id: "u1", name: "Alice" },
  update: { name: "Alice Updated" },
  where: { id: "u1" }, // shorthand or callback filter to locate existing row
});

// createMany
await db.posts.createMany([{ title: "Post A" }, { title: "Post B" }]);

// deleteMany — deletes all matching rows, returns count
const n = await db.users.where((u) => u.active.eq(false)).deleteMany();

// count
const total = await db.users.where({ active: true }).count();
```

### Reference

SQL ORM: `compileUpdateReturning`, `compileUpdateCount`, `compileDeleteCount` — IDB equivalent is cursor-scan + batch put/delete in a single readwrite transaction. SQL ORM has `RETURNING`; IDB echoes the merged record after `store.put()` (get → merge → put pattern already in `IdbUpdatePlan`).

### Changes to `IdbStoreAccessorImpl` (`store-accessor.ts`)

**New terminals (all use the existing cursor-scan infrastructure):**

| Method                              | Driver plan(s)                                                       | Returns             |
| ----------------------------------- | -------------------------------------------------------------------- | ------------------- |
| `update(patch)`                     | `cursor-scan` filter → `update` (key-get + merge + put) on first hit | `Row \| null`       |
| `updateMany(patch)`                 | `cursor-scan` filter → `bulk-put` (merge on each hit)                | `{ count: number }` |
| `upsert({ create, update, where })` | `key-get` on PK field → `put` (insert) or `update` (merge)           | `Row`               |
| `createMany(data[])`                | `bulk-put` — one IDB `put` per record in a single readwrite tx       | `Row[]`             |
| `deleteMany()`                      | `cursor-scan` filter → `bulk-delete`                                 | `{ count: number }` |
| `count()`                           | `cursor-scan` filter → count collected rows                          | `number`            |

**New driver-side plan kinds** added to `driver-idb/src/core/plan-body.ts`:

```ts
// batch-scan-write: cursor scan + conditional writes in one readwrite tx
// (used by update, updateMany, deleteMany — avoids N round-trips)
type IdbScanWritePlan = {
  kind: "scan-write";
  storeName: string;
  filter?: IdbRowFilter;
  take?: number; // 1 for update, undefined for updateMany/deleteMany
  write: "put-merged" | "delete"; // what to do per matching row
  patch?: Record<string, unknown>; // only for "put-merged"
};
// bulk-put: multiple puts in one readwrite tx (used by createMany)
type IdbBulkPutPlan = { kind: "bulk-put"; storeName: string; records: Record<string, unknown>[] };
```

These are added to `IdbAtomicPlan` and dispatched in `execute/ops.ts` via the existing callback-based pattern.

**New AST nodes** (`adapter-idb/src/core/idb-query-ast.ts`):

```ts
type IdbUpdateAst = { kind: "update"; modelName: string; patch: Record<string, unknown>; where?: IdbFilterExpr };
type IdbUpdateManyAst = {
  kind: "updateMany";
  modelName: string;
  patch: Record<string, unknown>;
  where?: IdbFilterExpr;
};
type IdbUpsertAst = {
  kind: "upsert";
  modelName: string;
  create: Record<string, unknown>;
  update: Record<string, unknown>;
  where: Record<string, unknown>;
};
type IdbCreateManyAst = { kind: "createMany"; modelName: string; data: Record<string, unknown>[] };
type IdbDeleteManyAst = { kind: "deleteMany"; modelName: string; where?: IdbFilterExpr };
type IdbCountAst = { kind: "count"; modelName: string; where?: IdbFilterExpr };
```

---

## Phase 6.3 — Multi-store transaction support

**Goal:** Allow multiple stores to be written atomically. Required before Phase 6.4 (nested writes across stores).

### Reference

SQL ORM: `withMutationScope()` in `mutation-executor.ts` calls `runtime.transaction()` to get a `RuntimeScope`, runs the callback, then `commit()` or `rollback()` on error. Identical pattern for IDB.

### Mental model

IDB transactions span one or more object stores named at open time. All requests inside the transaction either fully commit or fully roll back. We need to expose a way for the ORM layer to open a multi-store `readwrite` transaction and pipe multiple operations through it.

### New: `IdbTransactionScope` (`driver-idb/src/core/transaction-scope.ts`)

```ts
export interface IdbTransactionScope {
  execute(plan: IdbAtomicPlan): Promise<Record<string, unknown>[]>;
  commit(): Promise<void>; // resolves when tx.oncomplete fires
  rollback(): void; // calls tx.abort()
}
```

`IdbRuntimeDriverInstance` gains `transaction(storeNames: string[], mode?: IDBTransactionMode): IdbTransactionScope`.

Implementation: open one IDB transaction scoped to `storeNames`, wrap each `execute()` call with `executeOpInTx` (existing callback pattern) inside that transaction. `commit()` returns a Promise resolved by `tx.oncomplete`.

### New: `withMutationScope()` (`client-idb/src/core/mutation-scope.ts`)

Direct port of `withMutationScope()` from `sql-orm-client/mutation-executor.ts`:

```ts
export async function withMutationScope<T>(
  executor: IdbQueryExecutorWithTransaction,
  storeNames: string[],
  run: (scope: IdbTransactionScope) => Promise<T>
): Promise<T> {
  const tx = executor.transaction(storeNames, "readwrite");
  try {
    const result = await run(tx);
    await tx.commit();
    return result;
  } catch (err) {
    tx.rollback();
    throw err;
  }
}
```

`IdbQueryExecutorWithTransaction` extends `IdbQueryExecutor` with `transaction()`. `IdbRuntime` satisfies it by delegating to `driver.transaction()`.

---

## Phase 6.4 — Nested relation writes (create / connect / disconnect)

**Goal:** `create()` and `update()` accept relation fields as callback mutators. Requires Phase 6.3 (transaction scope).

```ts
// Nested create
await db.users.create({
  id: "u1",
  name: "Alice",
  posts: (rel) => rel.create([{ title: "Post 1" }, { title: "Post 2" }]),
});

// Nested connect
await db.users.where({ id: "u1" }).update({
  profile: (rel) => rel.connect({ id: "p1" }),
});

// Nested disconnect
await db.users.where({ id: "u1" }).update({
  profile: (rel) => rel.disconnect(),
});
```

### Reference

`sql-orm-client/relation-mutator.ts` — `createRelationMutator()`, `isRelationMutationDescriptor()`, `isRelationMutationCallback()`.
`sql-orm-client/mutation-executor.ts` — `parseMutationInput`, `partitionByOwnership`, `createGraph`, `updateFirstGraph`, `withMutationScope`.

**IDB adaptations vs SQL ORM:**

- No `RETURNING` clause — echo input record after `put` (already done in `IdbPutPlan`)
- After nested `update`, re-read via `key-get` to get the merged result (IDB `IdbUpdatePlan` already echoes merged record)
- `connect` for child-owned: find the related row by criterion (cursor-scan + filter), then `put` it with the FK set to the parent key — no SQL `UPDATE SET` needed
- `disconnect` for N:1: set the FK field to `null` in scalar data before insert/update
- Store names for `withMutationScope` are collected by walking the relation graph at parse time

### New: `IdbRelationMutator` (`client-idb/src/core/relation-mutator.ts`)

Direct port of `sql-orm-client/relation-mutator.ts`. Same `createRelationMutator()`, `isRelationMutationDescriptor()`, `isRelationMutationCallback()` functions — just different type imports.

```ts
export interface IdbRelationMutator<TContract, ModelName extends string> {
  create(data: CreateInput<TContract, ModelName> | CreateInput<TContract, ModelName>[]): RelationMutationCreate;
  connect(criteria: Record<string, unknown> | Record<string, unknown>[]): RelationMutationConnect;
  disconnect(criteria?: Record<string, unknown>[]): RelationMutationDisconnect;
}
```

### New: `IdbMutationExecutor` (`client-idb/src/core/mutation-executor.ts`)

Port of `sql-orm-client/mutation-executor.ts`:

| Function                                                      | IDB adaptation                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `parseMutationInput(contract, modelName, data)`               | Splits scalar fields from relation callbacks (identical logic)                 |
| `partitionByOwnership(mutations)`                             | N:1 → parentOwned; 1:N / 1:1 → childOwned (identical logic)                    |
| `createGraph(scope, contract, modelName, data)`               | Inserts via `scope.execute({ kind: 'put', ... })`; echoes record               |
| `updateFirstGraph(scope, contract, modelName, filters, data)` | Finds row by filter, merges patch via `scope.execute({ kind: 'update', ... })` |
| `hasNestedMutationCallbacks(contract, modelName, data)`       | Same check — any relation field that `isRelationMutationCallback`              |

### Changes to `IdbStoreAccessorImpl`

`create()` and `update()` detect relation callbacks via `hasNestedMutationCallbacks()`. When detected, wrap in `withMutationScope()` (collecting all required store names from the contract's relation graph).

---

## Phase 6.5 — Include refinement

**Goal:** `include()` accepts an optional refinement callback. After this phase:

```ts
// Refined include with filter + pagination
const users = await db.users
  .include("posts", (posts) => posts.where({ published: true }).orderBy({ createdAt: "desc" }).take(5))
  .all();

// Scalar include (count of related records)
const users = await db.users.include("posts", (posts) => posts.count()).all();
```

### Reference

`sql-orm-client/collection.ts` `include()` overload: `refineFn?` receives a child `Collection` and may return a refined `Collection` or an `IncludeScalar`. `isIncludeScalar()` / `isCollectionStateCarrier()` from `include-descriptors.ts` distinguish scalar vs collection refinement.

`sql-orm-client/include-strategy.ts` — dispatches includes using the refined collection state (filters/orderBy/take). IDB equivalent: use the refined `IdbAccessorState` directly to build the child cursor-scan plan.

### Changes to `include()` signature

```ts
include<K extends ReferenceRelKeys<TContract, ModelName>>(
  relation: K,
  refineFn?: (
    collection: IdbStoreAccessor<TContract, RelatedModelName>
  ) => IdbStoreAccessor<TContract, RelatedModelName> | IdbIncludeScalar,
): IdbStoreAccessor<TContract, ModelName, TIncludes & { [P in K]: RelationResult }>
```

`IdbIncludeScalar` is a thin marker object returned by `.count()` terminal (when called in refinement context):

```ts
interface IdbIncludeScalar {
  readonly kind: "scalar";
  readonly fn: "count";
}
```

### Changes to `relation-loader.ts`

The relation loader currently uses a fixed cursor-scan to load all FK-matching records. With refinement, it uses the `IdbAccessorState` returned by `refineFn` to build the sub-plan (inheriting filters, orderBy, take from the refined accessor).

For scalar reduces (`count()`), the loader counts matching rows rather than materializing them.

Include state in `IdbAccessorState` changes from `Record<string, true>` to:

```ts
type IncludeEntry =
  | { readonly kind: "collection"; readonly state: IdbAccessorState }
  | { readonly kind: "scalar"; readonly fn: "count" };
```

---

## Phase 6.6 — Aggregate / groupBy

**Goal:** Standalone aggregation and grouped aggregation. All in-memory (IDB has no aggregation API).

```ts
// Full aggregate
const stats = await db.posts.where({ published: true }).aggregate((agg) => ({
  total: agg.count(),
  totalViews: agg.sum("views"),
  avgViews: agg.avg("views"),
}));

// Grouped aggregate
const byUser = await db.posts
  .where({ published: true })
  .groupBy("authorId")
  .aggregate((agg) => ({ count: agg.count(), totalViews: agg.sum("views") }));
```

### Reference

`sql-orm-client/grouped-collection.ts` `GroupedCollection.aggregate()` — materializes rows, groups, runs aggregate functions. IDB uses the same pattern but purely in-memory (no SQL compilation).

`sql-orm-client/aggregate-builder.ts` — `createAggregateBuilder()` returns `{ count(), sum(field), avg(field), min(field), max(field) }`. Each returns an `AggregateSelector` marker with a `fn` tag and optional `field`. IDB version is identical minus the SQL AST.

`coerceAggregateValue(fn, value)` from `grouped-collection.ts` — handles bigint, string-encoded numbers, null, undefined for count. Port directly.

### New: `IdbGroupedAccessor` (`client-idb/src/core/grouped-accessor.ts`)

Port of `GroupedCollection`. The `aggregate()` terminal:

1. Materializes all matching rows via the base accessor's `all().toArray()`
2. Groups in-memory by the `groupBy` field(s)
3. Computes aggregate selectors per group
4. Returns typed result rows (group fields + aggregate aliases)

### New: `IdbAggregateBuilder` (`client-idb/src/core/aggregate-builder.ts`)

```ts
interface IdbAggregateSelector<T> {
  readonly fn: "count" | "sum" | "avg" | "min" | "max";
  readonly field?: string;
}

function createAggregateBuilder<TContract, ModelName>(): IdbAggregateBuilder<TContract, ModelName> {
  return {
    count: () => ({ fn: "count" }),
    sum: (field) => ({ fn: "sum", field }),
    avg: (field) => ({ fn: "avg", field }),
    min: (field) => ({ fn: "min", field }),
    max: (field) => ({ fn: "max", field }),
  };
}
```

### New standalone `aggregate()` terminal on `IdbStoreAccessor`

In addition to `groupBy().aggregate()`, the accessor itself gains `.aggregate()` for non-grouped aggregation:

```ts
aggregate<Spec extends Record<string, IdbAggregateSelector<unknown>>>(
  fn: (agg: IdbAggregateBuilder<TContract, ModelName>) => Spec
): Promise<AggregateResult<Spec>>
```

This is a pure in-memory reduce over the matching rows (same as `count()` for Phase 6.2, generalized).

---

## Phase 6.7 — Select projection

**Goal:** `select()` narrows the row shape returned. Post-materialization in-memory projection (IDB stores whole records).

```ts
const summaries = await db.users.select("id", "email").all();
// typeof summaries[0] === { id: string; email: string }
```

### Reference

`sql-orm-client/selection-shaping.ts` — `augmentSelectionForJoinColumns` adds join columns for relation loads. IDB equivalent is simpler: just strip non-selected fields from materialized rows after cursor-scan and after relation loads.

`sql-orm-client` collection type state carries `WithSelectState` tracking selected fields. IDB follows the same pattern: `IdbAccessorState.selectedFields?: ReadonlyArray<string>`.

### Changes to `IdbStoreAccessorImpl`

`select(...fields)` stores the field list in `IdbAccessorState.selectedFields`. After cursor-scan materialization and after relation loads, a projection step strips non-selected fields via `Object.fromEntries(selectedFields.map(f => [f, row[f]]))`.

The return type narrows: `select('id', 'email')` changes `Row` to `Pick<DefaultModelRow<...>, 'id' | 'email'>`.

**Important**: `selectedFields` must be augmented with FK columns needed by any pending `include()` loads before projection. This mirrors what `augmentSelectionForJoinColumns` does in sql-orm-client. The projection step is applied after all relation loads complete.

---

## Phase 7 — Outbox sync

**Goal:** Bidirectional sync on top of the runtime.

Port the existing sync work from the generator to the new architecture:

- Outbox on the client, changelog materialization on the server
- Ownership DAG validation (the 4 core invariants from todo.md)

---

---

## Historical: Original Phase 1-4 summaries

<details>
<summary>Phase 1-4 are done — click to expand for reference</summary>

### Phase 1 — Codec system (target-idb)

**Goal:** `target-idb` contributes a full `CodecLookup` for all 9 IDB scalar types.

**How it works:** The framework reads `types.codecTypes.codecInstances: ReadonlyArray<Codec>` off the descriptor at stack-assembly time and builds a `CodecLookup` internally.

**Implemented:**

- `src/core/codecs.ts` — one `Codec` object per scalar (9 total)
- Each codec: `id`, `targetTypes`, `traits`, `encode`, `decode`, `encodeJson`, `decodeJson`
- IDB stores JS values natively, so most are identity transforms
- Notable: `DateTime` → JS `Date`, `Decimal` → string round-trip, `Bytes` → `Uint8Array`/`ArrayBuffer`, `BigInt` → `bigint`

### Phase 2 — Runtime plane: driver (driver-idb)

**Goal:** `driver-idb/runtime` can open an actual `IDBDatabase` and execute basic operations.

- `create(dbName, version)` opens `window.indexedDB.open(...)`
- `execute(planBody)` runs a plan body inside an IDB transaction
- Tested with `fake-indexeddb`

### Phase 3 — Runtime plane: query lowering (adapter-idb)

**Goal:** `adapter-idb/runtime` translates a Prisma query AST into IDB plan bodies.

- Implemented `lower(queryAST)` for `findMany`, `create`, `update`, `delete`, `findFirst`, `findUnique`
- `IdbQueryAst` added for middleware introspection of query intent

### Phase 4 — Control plane: manifest-based operations (family-idb)

**Goal:** Manifest file operations for the CLI.

- Manifest file format (JSON, versioned)
- `introspect`, `verify`, `sign`, `readMarker`, `schemaVerify`

</details>

**Immediate next step** = Phase 6.1 (filter expression AST). Demo app scaffold (`apps/prisma-next-usage/`) is being set up in parallel by the user. Tests follow the red-green pattern: write the test in the demo app first, then implement in the package.

Also consider WebWorker support (Phase 8) — the runtime and driver should be architected with workerization in mind (no direct `window` access in the driver, abstracted via an adapter layer).
