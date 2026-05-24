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

## Phase 6.1 — Filter expression AST + operator API

**Goal:** Replace the equality-only `WhereFilter` with a full expression AST and a typed `ModelAccessor` proxy. After this phase a developer can write:

```ts
// Callback form with operators:
await db.posts.where((p) => p.views.gt(100)).all();
await db.users.where((u) => u.name.contains("Alice")).all();
await db.users.where((u) => and(u.age.gte(18), u.active.eq(true))).all();

// Shorthand still works (equality only, unchanged):
await db.users.where({ active: true }).all();
```

### New: `IdbFilterExpr` discriminated union (`adapter-idb/src/core/idb-filter-expr.ts`)

Mirror of `MongoFilterExpr` from `@prisma-next/mongo-query-ast`. Frozen class nodes, visitor-friendly.

```ts
type IdbFilterExpr =
  | IdbFieldFilter // { kind: 'field', field, op, value }
  | IdbAndExpr // { kind: 'and', exprs }
  | IdbOrExpr // { kind: 'or', exprs }
  | IdbNotExpr // { kind: 'not', expr }
  | IdbNullCheckExpr; // { kind: 'null-check', field, isNull }
```

Operators on `IdbFieldFilter`: `eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `in`, `notIn`, `contains`, `startsWith`, `endsWith`.

### New: `evaluateFilter(expr, row)` (`adapter-idb/src/core/filter-eval.ts`)

Walks the `IdbFilterExpr` tree against a materialized row. Replaces the current closure-based `#buildFilter()` in `store-accessor.ts`. This function is used directly in the `cursor-scan` executor inside `driver-idb`.

### New: `IdbModelAccessor` proxy (`client-idb/src/core/model-accessor.ts`)

Mirrors `createModelAccessor()` from `sql-orm-client`. A `Proxy` keyed on field names; each field returns a scalar accessor with operator methods:

```ts
interface IdbFieldAccessor<T> {
  eq(value: T): IdbFilterExpr;
  neq(value: T): IdbFilterExpr;
  gt(value: T): IdbFilterExpr; // only if field type is orderable
  lt(value: T): IdbFilterExpr;
  gte(value: T): IdbFilterExpr;
  lte(value: T): IdbFilterExpr;
  in(values: T[]): IdbFilterExpr;
  notIn(values: T[]): IdbFilterExpr;
  contains(value: string): IdbFilterExpr; // string fields only
  startsWith(value: string): IdbFilterExpr; // string fields only
  endsWith(value: string): IdbFilterExpr; // string fields only
  isNull(): IdbFilterExpr;
  isNotNull(): IdbFilterExpr;
}
```

Unlike the SQL version, IDB does not use codec trait-gating — all operators are always available (IDB stores JS values natively, so numeric vs string comparisons are governed by JS semantics, not codec metadata).

### New: `and()`, `or()`, `not()` helpers (`client-idb/src/core/filters.ts`)

```ts
export const and = (...exprs: IdbFilterExpr[]): IdbAndExpr => ...
export const or  = (...exprs: IdbFilterExpr[]): IdbOrExpr  => ...
export const not = (expr: IdbFilterExpr): IdbNotExpr       => ...
```

### Changes to existing files

| File                | Change                                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store-state.ts`    | `filters: IdbFilterExpr[]` (was `Record<string, unknown>[]`)                                                                                                                                  |
| `store-accessor.ts` | `where()` gains overload: `where(fn: (m: IdbModelAccessor) => IdbFilterExpr)`. Shorthand object form converts via `shorthandToFilterExpr()`. Filters accumulate as `IdbAndExpr`-wrapped list. |
| `idb-query-ast.ts`  | `IdbFindManyAst.where` becomes `IdbFilterExpr` (was `Record<string, unknown>`)                                                                                                                |
| `driver-idb/ops.ts` | `execCursorScan` uses `evaluateFilter(plan.filter, row)` instead of calling the filter closure directly                                                                                       |

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
  by: "id", // the unique field to match on
});

// createMany
await db.posts.createMany([{ title: "Post A" }, { title: "Post B" }]);

// deleteMany — deletes all matching rows, returns count
const n = await db.users.where((u) => u.active.eq(false)).deleteMany();

// count
const total = await db.users.where({ active: true }).count();
```

### Changes to `IdbStoreAccessorImpl` (`store-accessor.ts`)

**New terminals (all use the existing cursor-scan infrastructure):**

| Method                           | IDB plan                                      | Returns             |
| -------------------------------- | --------------------------------------------- | ------------------- |
| `update(patch)`                  | cursor-scan → filter → put first match        | `Row \| null`       |
| `updateMany(patch)`              | cursor-scan → filter → put each match         | `{ count: number }` |
| `upsert({ create, update, by })` | key-get on `by` field → put (insert or merge) | `Row`               |
| `createMany(data[])`             | multiple put ops                              | `Row[]`             |
| `deleteMany()`                   | cursor-scan → filter → delete each match      | `{ count: number }` |
| `count()`                        | cursor-scan → filter → count                  | `number`            |

**New driver-side op for bulk operations:**

Add `IdbBulkDeletePlan` and `IdbBulkPutPlan` to `plan-body.ts` + `ops.ts` so the driver can handle multiple writes in a single transaction without round-tripping through the executor per record.

```ts
// plan-body.ts additions
type IdbBulkPutPlan = { kind: "bulk-put"; storeName: string; records: Record<string, unknown>[] };
type IdbBulkDeletePlan = { kind: "bulk-delete"; storeName: string; keys: IDBValidKey[] };
```

**New AST nodes (`idb-query-ast.ts`):**

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
  by: string;
};
type IdbCreateManyAst = { kind: "createMany"; modelName: string; data: Record<string, unknown>[] };
type IdbDeleteManyAst = { kind: "deleteMany"; modelName: string; where?: IdbFilterExpr };
type IdbCountAst = { kind: "count"; modelName: string; where?: IdbFilterExpr };
```

---

## Phase 6.3 — Multi-store transaction support

**Goal:** Allow multiple stores to be written atomically. Required before Phase 6.4 (nested writes across stores).

### Mental model

IDB transactions span one or more object stores named at open time. All requests inside the transaction either fully commit or fully roll back. We need to expose a way for the ORM layer to open a multi-store `readwrite` transaction and pipe multiple operations through it.

### New: `IdbTransactionScope` (`driver-idb/src/core/transaction-scope.ts`)

```ts
interface IdbTransactionScope {
  readonly tx: IDBTransaction;
  execute(plan: IdbAtomicPlan): Promise<Record<string, unknown>[]>;
  commit(): Promise<void>; // waits for tx.oncomplete
  rollback(): void; // calls tx.abort()
}

// On IdbDriver:
interface IdbDriver {
  // ... existing
  transaction(storeNames: string[], mode: IDBTransactionMode): IdbTransactionScope;
}
```

### New: `withMutationScope()` (`client-idb/src/core/mutation-scope.ts`)

Port of `withMutationScope()` from `sql-orm-client/mutation-executor.ts`. Acquires a multi-store `readwrite` transaction from the driver, runs the callback, then commits.

```ts
async function withMutationScope<T>(
  executor: IdbQueryExecutor,
  storeNames: string[],
  run: (scope: IdbTransactionScope) => Promise<T>
): Promise<T>;
```

The executor interface gains a `transaction()` method. `IdbRuntime` satisfies it via `driver.transaction()`.

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

### New: `IdbRelationMutator` (`client-idb/src/core/relation-mutator.ts`)

Direct port of `relation-mutator.ts` from `sql-orm-client`:

```ts
interface IdbRelationMutator<TContract, ModelName extends string> {
  create(data: CreateInput<TContract, ModelName> | CreateInput<TContract, ModelName>[]): RelationMutationCreate;
  connect(criteria: Record<string, unknown> | Record<string, unknown>[]): RelationMutationConnect;
  disconnect(criteria?: Record<string, unknown>[]): RelationMutationDisconnect;
}
```

### New: `IdbMutationExecutor` (`client-idb/src/core/mutation-executor.ts`)

Port of `mutation-executor.ts` from `sql-orm-client`, adapted for IDB:

- `parseMutationInput(contract, modelName, data)` — separates scalar fields from relation callbacks
- `partitionByOwnership(mutations)` — N:1 (parent-owned) vs 1:N / 1:1 (child-owned)
- `createGraph(scope, context, modelName, data)` — recursive nested insert
- `updateFirstGraph(scope, context, modelName, filters, data)` — nested update

Key IDB difference from SQL: there is no `RETURNING` clause, so after an insert we echo the input record (same as the current `put` op does). After an update, we re-read the record with a key-get to get the merged result.

### Changes to `IdbStoreAccessorImpl`

`create()` and `update()` detect relation callbacks via `hasNestedMutationCallbacks()`. When nested writes are detected, the operation is wrapped in `withMutationScope()`.

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

### Changes to `include()` signature

```ts
include<K extends ReferenceRelKeys<TContract, ModelName>>(
  relation: K,
  refineFn?: (collection: IdbStoreAccessor<TContract, RelatedModelName>) =>
    | IdbStoreAccessor<TContract, RelatedModelName>
    | IdbIncludeScalar,
): IdbStoreAccessor<TContract, ModelName, TIncludes & { [P in K]: RelationResult }>
```

### Changes to `relation-loader.ts`

The relation loader currently uses a fixed cursor-scan to load all FK-matching records. With refinement, it uses the accessor returned by `refineFn` to build the sub-plan (inheriting the filters, orderBy, take from the refined accessor).

For scalar reduces (`count()`), the loader issues a count cursor-scan instead of a row-materializing scan.

Include state in `IdbAccessorState` changes from `Record<string, true>` to:

```ts
type IncludeEntry = { refined: IdbAccessorState } | { scalar: "count" | "sum" | "avg" | "min" | "max" };
```

---

## Phase 6.6 — Aggregate / groupBy

**Goal:** Standalone aggregation and grouped aggregation. All in-memory (IDB has no aggregation API).

```ts
// Simple count
const total = await db.posts.where({ published: true }).count();

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

### New: `IdbGroupedAccessor` (`client-idb/src/core/grouped-accessor.ts`)

Port of `GroupedCollection` from `sql-orm-client`. Wraps a base accessor with a `groupBy` field list. The `aggregate()` terminal:

1. Materializes all matching rows (via the base accessor's cursor-scan)
2. Groups by the specified fields in-memory
3. Computes aggregate functions per group
4. Returns typed result rows

### New: `IdbAggregateBuilder`

```ts
interface IdbAggregateBuilder<TContract, ModelName extends string> {
  count(): IdbAggregateSelector<number>;
  sum<F extends NumericFieldNames<TContract, ModelName>>(field: F): IdbAggregateSelector<number | null>;
  avg<F extends NumericFieldNames<TContract, ModelName>>(field: F): IdbAggregateSelector<number | null>;
  min<F extends NumericFieldNames<TContract, ModelName>>(field: F): IdbAggregateSelector<number | null>;
  max<F extends NumericFieldNames<TContract, ModelName>>(field: F): IdbAggregateSelector<number | null>;
}
```

---

## Phase 6.7 — Select projection

**Goal:** `select()` narrows the row shape returned. Post-materialization in-memory projection (IDB stores whole records).

```ts
const summaries = await db.users.select("id", "email").all();
// typeof summaries[0] === { id: string; email: string }
```

### Changes to `IdbStoreAccessorImpl`

`select(...fields)` stores the field list in `IdbAccessorState.selectedFields`. After cursor-scan materialization (and after relation loads), a projection step strips non-selected fields.

The return type narrows: `select('id', 'email')` changes `Row` to `Pick<DefaultModelRow<...>, 'id' | 'email'>`.

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

**Immediate next step** = Demo app (`apps/prisma-next-demo/`). Exercise the full stack: contract → idbOrm → runtime → adapter → driver → IndexedDB.
