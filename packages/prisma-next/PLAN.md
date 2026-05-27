## Status

_Last reviewed: 2026-05-27 — Phase 7 done (migration package layer rewrite). See [`plans/`](plans/) for the per-phase plan docs (7.1–7.8). Phase 7 absorbs the architectural feedback from [`FEEDBACKS.md`](FEEDBACKS.md): manifest deleted, planner moved to design-time, browser walks `ContractSpace.migrations`, safe-default policy, space-keyed marker, `versionchange` handler, new `prisma-next-idb` CLI (`generate-contract-space`, `preflight`). Earlier review findings (issues #1-16, 2026-05-25) still resolved._

| Phase | Description                                                                                       | Status                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Codec system (`target-idb`)                                                                       | ✅ Done                                                                                                                                                                                      |
| 2     | Runtime driver (`driver-idb`)                                                                     | ✅ Done — Issue #11 (batch-with-update tx mode) fixed                                                                                                                                        |
| 3     | Query lowering (`adapter-idb`)                                                                    | ✅ Done (passthrough; per-field codec encoding deferred — all codecs identity); Issue #13 (descriptor `.create()` codec wiring) fixed                                                        |
| 4     | Control plane manifest operations (`family-idb`)                                                  | ✅ Done — Issues #1, #2, #4 resolved                                                                                                                                                         |
| 5     | Migration infrastructure (`target-idb/control`)                                                   | ✅ Done — CLI `db update`/`db init` fully working and idempotent; Issues #14 (TS renderer `unique: undefined`) + #15 (index mutations) fixed                                                 |
| 6     | IDB ORM lane (`client-idb`) + runtime (`runtime-idb`)                                             | 🚧 MVP done — all issues resolved; Phase 6.3 done                                                                                                                                            |
| 6.1   | Filter expression AST + operator API                                                              | ✅ Done — `IdbFilterExpr` + evaluator + `IdbModelAccessor` proxy + `and/or/not`; shorthand `null` lifts to null-check                                                                        |
| 6.2   | Missing CRUD terminals (update, upsert, createAll/Count, deleteAll/Count, updateAll/Count, count) | ✅ Done — vendor naming adopted; `IdbScanWritePlan` + `IdbBatchPlan` driver primitives; 9 new ORM methods; known gap: `.where()` enforcement not compile-time-checked                        |
| 6.3   | Multi-store transaction support                                                                   | ✅ Done — `IdbTransactionScope` + `createTransactionScope` in driver; `withMutationScope` + `IdbQueryExecutorWithTransaction` in client; `IdbRuntime.transaction()` wired; Issue #6 resolved |
| 6.4   | Nested relation writes (create/connect/disconnect)                                                | ❌ Not started                                                                                                                                                                               |
| 6.5   | Include refinement (where/orderBy/take inside include)                                            | ❌ Not started                                                                                                                                                                               |
| 6.6   | Aggregate / groupBy                                                                               | ❌ Not started                                                                                                                                                                               |
| 6.7   | Select projection                                                                                 | ❌ Not started                                                                                                                                                                               |
| 7     | Migration package layer rewrite (Group A + B feedback)                                            | ✅ Done — see [plans/](plans/) for the 8 per-phase docs (7.1–7.8)                                                                                                                            |
| 7.1   | Foundation: `IdbMigration` base + `MigrationCLI` shim                                             | ✅ Done                                                                                                                                                                                      |
| 7.2   | Planner refit: class-based `migration.ts` scaffold                                                | ✅ Done                                                                                                                                                                                      |
| 7.3   | Runner refit + manifest demolition + control-instance refusal                                     | ✅ Done                                                                                                                                                                                      |
| 7.4   | Browser runtime refit: walk `contractSpace.migrations`; safe policy; `versionchange`              | ✅ Done                                                                                                                                                                                      |
| 7.5   | ContractSpace codegen (`prisma-next-idb generate-contract-space`)                                 | ✅ Done                                                                                                                                                                                      |
| 7.6   | Migration preflight (`prisma-next-idb preflight`)                                                 | ✅ Done                                                                                                                                                                                      |
| 7.7   | Migrate `apps/prisma-next-usage`                                                                  | ✅ Done — manifest deleted; baseline migration package on disk                                                                                                                               |
| 7.8   | Cleanups closure + memory + this status                                                           | ✅ Done                                                                                                                                                                                      |
| 8     | Outbox sync                                                                                       | ❌ Not started (was previously Phase 7; renumbered after migration-rewrite landed)                                                                                                           |

### Test status (run 2026-05-27, after Phase 7)

| Package             | Tests pass | Tests fail | Notes                                                                                               |
| ------------------- | ---------: | ---------: | --------------------------------------------------------------------------------------------------- |
| `target-idb`        |         81 |          0 | +7 IdbMigration, +5 MigrationCLI (Phase 7.1); planner renderer updated for class-based output (7.2) |
| `driver-idb`        |         57 |          0 | `versionchange` handler + space-keyed marker read fallback (Phases 7.3/7.4)                         |
| `adapter-idb`       |         29 |          0 | unchanged                                                                                           |
| `runtime-idb`       |         21 |          0 | unchanged                                                                                           |
| `client-idb`        |         66 |          0 | `auto-migrate-evolution` rewritten for `contractSpace` walking + destructive-refuse default (7.4)   |
| `family-idb`        |         52 |          0 | manifest tests removed (7.3); +6 codegen (7.5) + +4 preflight (7.6); control-instance refusal tests |
| `prisma-next-usage` |         65 |          0 | Playwright unchanged; full app stack works end-to-end on `contractSpace` (7.7)                      |

**Total: 371/371 tests passing (306 vitest + 65 Playwright).**

[Issue #1]: #issue-1--migrationrunner-missing-executeacrossspaces-blocks-cli-db-update
[Issue #2]: #issue-2--sign-does-not-populate-manifestschema-from-contract
[Issue #4]: #issue-4--missing-stores-treated-as-warnings-in-lenient-schema-verify

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

> **Note (resolved 2026-05-25):** `IdbManifest` now carries the optional `idbVersion?: number` field, and `createAutoMigratingIdbClient` uses it when present (`baseVersion = manifest?.idbVersion ?? currentDbVersion`, `targetVersion = baseVersion + 1`). The runtime path is fully wired; the CLI path to _write_ the bumped `idbVersion` back to the manifest is gated on Issue #1 (`db update` doesn't run yet).

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

**Status:** 🚧 Packages are implemented and tested. Demo app (`apps/prisma-next-usage/`) exists with SvelteKit UI that exercises the happy path (`create`, `all`, `findUnique`, `delete`, `where {field: value}`, `orderBy`). Playwright is configured but no `*.e2e.ts` spec files exist yet — interactive testing only.

**New since original Phase 6 plan:**

- `client-idb` now ships three entrypoints: `./orm` (just the typed accessor factory), `./client` (full stack assembled), `./client-auto` (auto-migration on first use).
- `runtime-idb` builds a real `RuntimeMiddlewareContext` from the contract — including a `contentHash()` implementation that canonicalizes plan structure and SHA-512-hashes it via WebCrypto. Non-serializable fields (`IdbRowFilter`, `IdbRowComparator`, `IDBKeyRange`) are reduced to deterministic identity so identical queries hash identically. Suitable for `@prisma-next/middleware-cache`.
- `family-idb` exposes a `defineContract()` TypeScript-first authoring path (TS-first; no Prisma DSL needed), plus the `typescriptContract()` config helper consumed by `prisma-next.config.ts`.
- Grouping keys are attached to every plan via `plan.meta.annotations.groupingKey` (ADR 160). Sub-plans for `include()` reuse the same grouping key so middleware can correlate the main scan with its relation loads.

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
- `include(relName)` — batch FK relation load (one level, no refinement). Handles both `1:N` (groups → arrays) and `N:1`/`1:1` (indexes → singles). Short-circuits when all local FK values are null.
- `orderBy(spec)` — in-memory comparator
- `take(n)` / `skip(n)` — inline during cursor scan
- Auto-migration: `createAutoMigratingIdbClient({ contract, dbName, manifest? })` diffs schema, opens IDB at `targetVersion = (manifest.idbVersion ?? currentDbVersion) + 1`, runs DDL in `upgradeneeded`, writes marker (ADR 008 Path A).
- Type-safe builder chain: each method returns a new `IdbStoreAccessorImpl` (immutable). `.include()` widens `TIncludes` so the row return type grows.

### Where the MVP stops short of the vendor pattern

- Driver primitives `IdbUpdatePlan`, `IdbDeletePlan` (key-range), `IdbBatchPlan` exist but no ORM surface uses them yet.
- `IdbBatchPlan` provides single-tx multi-store atomicity at the driver layer, but no `IdbTransactionScope` / `withMutationScope()` exists in `client-idb` (Phase 6.3 still open).
- `IdbCursorScanPlan` supports `indexName` and `range` for index-accelerated scans, but the ORM never sets them — every `where`/`findUnique-by-unique-index` falls through to a full cursor scan with in-memory filter.
- The adapter (`IdbAdapter.lower()`) is a pure passthrough — codec registry and `ctx.contract` are unused. All `idb/*` codecs are identity transforms today so this is functionally correct, but `createIdbClient()` instantiates the adapter with `emptyCodecLookup` instead of pulling the real codecs from `target-idb` — so the codec path is _never_ tested even in principle ([Issue #3]).
- ORM grouping key counter (`_nextGroupingKey`) is module-level, not per-runtime. Two clients in the same JS process share the counter — observable in middleware but not a correctness bug.

[Issue #3]: #issue-3--createidbclient-instantiates-the-adapter-with-emptycodeclookup

---

## Parallel Testing Strategy

Each Phase 6.x implementation step is developed alongside a matching test file in `apps/prisma-next-usage`. Tests in the demo app provide integration-level coverage (contract → idbOrm → runtime → driver → IDB) that the package unit tests cannot fully cover.

### Mapping: phase → test file

| Phase | `apps/prisma-next-usage/test/` file(s)                                                                                                                                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6.1   | `filterConditions/operators.spec.ts`, `filterConditions/combinators.spec.ts`                                                                                                                                                                                                                                 |
| 6.2   | `modelQueries/update.spec.ts`, `modelQueries/updateAll.spec.ts`, `modelQueries/updateCount.spec.ts`, `modelQueries/upsert.spec.ts`, `modelQueries/createAll.spec.ts`, `modelQueries/createCount.spec.ts`, `modelQueries/deleteAll.spec.ts`, `modelQueries/deleteCount.spec.ts`, `modelQueries/count.spec.ts` |
| 6.3   | `atomicOperations/multiStoreTransaction.spec.ts`                                                                                                                                                                                                                                                             |
| 6.4   | `nestedWrites/create.spec.ts`, `nestedWrites/connect.spec.ts`, `nestedWrites/disconnect.spec.ts`                                                                                                                                                                                                             |
| 6.5   | `includeRefinement/whereInsideInclude.spec.ts`, `includeRefinement/scalarInclude.spec.ts`                                                                                                                                                                                                                    |
| 6.6   | `modelQueries/aggregate.spec.ts`, `modelQueries/groupBy.spec.ts`                                                                                                                                                                                                                                             |
| 6.7   | `modelQueries/select.spec.ts`                                                                                                                                                                                                                                                                                |

**Already covered** (from demo app setup): `modelQueries/create.spec.ts`, `modelQueries/findFirst.spec.ts`, `modelQueries/findUnique.spec.ts`, `modelQueries/delete.spec.ts`, `filterConditions/equality.spec.ts`, `modelQueryOptions/orderBy.spec.ts`, `modelQueryOptions/take.spec.ts`, `modelQueryOptions/skip.spec.ts`, `nestedQueries/include.spec.ts`.

### Rule

Write the demo app test first (red), then implement the feature in the package (green). The demo app tests exercise the fully assembled stack; package unit tests (`client-idb/test/orm.test.ts`) cover edge cases and internal invariants in isolation.

---

## Phase 6.1 — Filter expression AST + operator API ✅ Done

**Status (2026-05-26):** Shipped. `IdbFilterExpr` (frozen-object AST), `evaluateFilter`, `shorthandToFilterExpr`, the Proxy-based `IdbModelAccessor`, and the `and` / `or` / `not` combinators are all live in `adapter-idb` and `client-idb`. `IdbStoreAccessorImpl.where()` accepts both shorthand (`{ field: value }`, with `null` lifting to a null-check expression) and callback (`(m) => m.field.op(value)`) forms; multiple `.where()` calls compose with AND. The query-runner shell in `apps/prisma-next-usage` exposes the combinators in the JS sandbox so Playwright specs use the same operator surface end-to-end.

Tests: 18 new vitest cases in `adapter-idb/test/filter-expr.test.ts` (operators, combinators, null-check, shorthand lift) and 13 new client-idb integration tests in `client-idb/test/operators.test.ts` exercising the whole stack through `fake-indexeddb`. The 12 Phase-6.1 Playwright specs in `apps/prisma-next-usage/tests/operators.spec.ts` cover the same surface against a real Vite preview build.

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

## Phase 6.2 — Missing CRUD terminals ✅ Done

**Status (2026-05-26):** Shipped. Vendor naming (`updateAll/updateCount`, `createAll/createCount`, `deleteAll/deleteCount`) adopted instead of the original `updateMany/createMany/deleteMany` sketch. `IdbScanWritePlan` (readwrite cursor, put-merged or delete) and `IdbBatchPlan` (N puts in one tx) handle the driver layer. 9 new ORM terminals on `IdbStoreAccessorImpl`. 43 new Playwright E2E specs across 9 files all pass. **Known gap:** `.where()` before `update`/`updateAll`/`updateCount`/`deleteAll`/`deleteCount` is not enforced at compile time — the SQL ORM vendor achieves this via a state-machine type parameter, deferred to a post-6.2 type-level refactor.

**Goal:** Close the gap on the most-needed write operations. After this phase:

```ts
// update — first matching row (requires .where())
await db.users.where({ id: "u1" }).update({ displayName: "New Name" }); // → Row | null

// updateAll — all matching rows returned (requires .where())
const rows = await db.users.where((u) => u.active.eq(false)).updateAll({ archivedAt: new Date() });

// updateCount — count of updated rows (requires .where())
const n = await db.users.where((u) => u.active.eq(false)).updateCount({ archivedAt: new Date() });

// upsert
await db.users.upsert({
  create: { id: "u1", name: "Alice" },
  update: { name: "Alice Updated" },
  where: { id: "u1" },
});

// createAll — batch insert, returns all inserted rows
const rows = await db.posts.createAll([{ title: "Post A" }, { title: "Post B" }]);

// createCount — batch insert, returns count only
const n = await db.posts.createCount([{ title: "Post A" }, { title: "Post B" }]);

// deleteAll — deletes matching rows, returns deleted rows
const deleted = await db.users.where({ active: false }).deleteAll();

// deleteCount — deletes matching rows, returns count
const n = await db.users.where({ active: false }).deleteCount();

// count — count matching rows (0 filters = count all)
const total = await db.users.where({ active: true }).count();
```

### Reference

SQL ORM: `compileUpdateReturning` (`updateAll`), `compileUpdateCount` (`updateCount`), `compileDeleteCount` (`deleteCount`), `compileDeleteReturning` (`deleteAll`), `compileBatchInsert` (`createAll/createCount`). IDB equivalent: `IdbScanWritePlan` (readwrite cursor, `put-merged` or `delete`) + `IdbBatchPlan` (N `put` ops in one tx). `updateAll`/`deleteAll` both return rows (vendor uses `RETURNING`; IDB captures row before `cursor.delete()` and echoes merged row after `cursor.update()`).

### Changes to `IdbStoreAccessorImpl` (`store-accessor.ts`)

**New terminals (all use the existing cursor-scan infrastructure):**

| Method                              | Driver plan(s)                                                                 | Returns                    |
| ----------------------------------- | ------------------------------------------------------------------------------ | -------------------------- |
| `update(patch)`                     | `IdbScanWritePlan { write:"put-merged", take:1 }` + accumulated filter         | `Row \| null`              |
| `updateAll(patch)`                  | `IdbScanWritePlan { write:"put-merged" }` + accumulated filter                 | `AsyncIterableResult<Row>` |
| `updateCount(patch)`                | delegates to `updateAll(patch).toArray().length`                               | `number`                   |
| `upsert({ create, update, where })` | `first()` with where filter → `IdbPutPlan` (insert) or `IdbUpdatePlan` (merge) | `Row`                      |
| `createAll(data[])`                 | `IdbBatchPlan` with N `IdbPutPlan` ops                                         | `AsyncIterableResult<Row>` |
| `createCount(data[])`               | delegates to `createAll(data).toArray().length`                                | `number`                   |
| `deleteAll()`                       | `IdbScanWritePlan { write:"delete" }` + accumulated filter                     | `AsyncIterableResult<Row>` |
| `deleteCount()`                     | delegates to `deleteAll().toArray().length`                                    | `number`                   |
| `count()`                           | existing `cursor-scan` plan, drains without collecting                         | `number`                   |

**New driver-side plan kind** added to `driver-idb/src/core/plan-body.ts`:

```ts
// readwrite cursor scan — put-merged or delete per matching row
type IdbScanWritePlan = {
  kind: "scan-write";
  storeName: string;
  filter?: IdbRowFilter;
  take?: number; // 1 for update(), undefined for updateAll/deleteAll
  write: "put-merged" | "delete";
  patch?: Record<string, unknown>; // required when write === "put-merged"
};
```

Added to `IdbAtomicPlan` and dispatched in `execute/ops.ts`. `planTxMode()` returns `"readwrite"` for `"scan-write"`.

**New AST nodes** (`adapter-idb/src/core/idb-query-ast.ts`):

```ts
type IdbUpdateAst = { kind: "update"; modelName: string; patch: Record<string, unknown>; where?: IdbFilterExpr };
type IdbUpdateAllAst = { kind: "updateAll"; modelName: string; patch: Record<string, unknown>; where?: IdbFilterExpr };
type IdbUpdateCountAst = {
  kind: "updateCount";
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
type IdbCreateAllAst = { kind: "createAll"; modelName: string; data: Record<string, unknown>[] };
type IdbCreateCountAst = { kind: "createCount"; modelName: string; data: Record<string, unknown>[] };
type IdbDeleteAllAst = { kind: "deleteAll"; modelName: string; where?: IdbFilterExpr };
type IdbDeleteCountAst = { kind: "deleteCount"; modelName: string; where?: IdbFilterExpr };
type IdbCountAst = { kind: "count"; modelName: string; where?: IdbFilterExpr };
```

### Known gap — `.where()` compile-time enforcement

The SQL ORM vendor enforces `.where()` before `update/updateAll/updateCount/deleteAll/deleteCount` at **compile time** via a state-machine type parameter. Our `IdbStoreAccessor` does not yet carry this parameter — calling `updateAll(patch)` without `.where()` updates every row (equivalent to `UPDATE table SET ...` with no WHERE). This is correct runtime behavior; the type system just doesn't warn about it. Deferred to a post-6.2 type-level refactor.

---

## Phase 6.3 — Multi-store transaction support ✅ Done

**Status (2026-05-26):** Shipped. `IdbTransactionScope` (interface + `IdbTransactionScopeImpl`) + `createTransactionScope()` factory live in `driver-idb/src/core/transaction-scope.ts`. `withMutationScope()` + `IdbQueryExecutorWithTransaction` live in `client-idb/src/core/mutation-scope.ts`. `IdbRuntime.transaction()` delegates to `driver.db` + `createTransactionScope()`. Issue #6 resolved: scope operations bypass the middleware chain, so the cache middleware never incorrectly fires inside a transaction.

**Goal:** Allow multiple stores to be written atomically. Required before Phase 6.4 (nested writes across stores).

### Reference

SQL ORM: `withMutationScope()` in `mutation-executor.ts` calls `runtime.transaction()` to get a `RuntimeScope`, runs the callback, then `commit()` or `rollback()` on error. Identical pattern for IDB.

### Mental model

IDB transactions span one or more object stores named at open time. All requests inside the transaction either fully commit or fully roll back. `IdbTransactionScope.execute(plan)` runs `executeOpInTx` directly inside the pre-opened `IDBTransaction` — no new transaction is opened per call. `commit()` returns a Promise that resolves when `tx.oncomplete` fires (all writes durable). `rollback()` calls `tx.abort()`.

Transaction liveness across `await` boundaries: `IDBTransaction` auto-commits only in a macro-task (not a microtask). Since `await` resumes via a microtask, issuing the next `scope.execute()` call immediately after an `await` keeps the transaction alive. The standard `withMutationScope` usage pattern never crosses a macro-task boundary.

### New: `IdbTransactionScope` (`driver-idb/src/core/transaction-scope.ts`)

```ts
export interface IdbTransactionScope {
  execute(plan: IdbAtomicPlan): Promise<Record<string, unknown>[]>;
  commit(): Promise<void>; // resolves when tx.oncomplete fires
  rollback(): void; // calls tx.abort() (idempotent — ignores already-aborted)
}
```

`IdbRuntimeDriverInstance` gains `transaction(storeNames: string[], mode?: IDBTransactionMode): Promise<IdbTransactionScope>` (async because `driver.db` is a `Promise<IDBDatabase>`).

### New: `withMutationScope()` (`client-idb/src/core/mutation-scope.ts`)

```ts
export async function withMutationScope<T>(
  executor: IdbQueryExecutorWithTransaction,
  storeNames: string[],
  run: (scope: IdbTransactionScope) => Promise<T>
): Promise<T> {
  const tx = await executor.transaction(storeNames, "readwrite");
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

`IdbQueryExecutorWithTransaction` extends `IdbQueryExecutor` with `transaction(storeNames, mode?): Promise<IdbTransactionScope>`. `IdbRuntime` satisfies it by delegating to `driver.db` + `createTransactionScope()`.

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

## Phase 8 — `contract infer`

**Goal:** Make `prisma-next contract infer` work for IDB by implementing the `PslContractInferCapable` capability on the family descriptor. Currently the CLI returns `"contract infer is not supported for this family"`.

**What it does:** Reads `manifest.schema.stores` (the live IDB schema as the manifest driver sees it) and emits a PSL-like contract definition that mirrors that schema. Useful for bootstrapping a contract from an existing IDB database, or for inspecting what schema the CLI currently sees.

**Implementation sketch:**

The family descriptor needs to gain the `PslContractInferCapable` capability. This involves:

1. `family-idb/src/core/control-descriptor.ts` — add `PslContractInferCapable` to the descriptor's capability list.
2. New `inferContract(driver)` implementation that:
   - Calls `introspect(driver)` to get `manifest.schema` (already implemented)
   - Converts each `IdbStoreIR` into a `ModelDef`-like representation (store name, keyPath, indexes)
   - Outputs a synthetic `defineContract(...)` call or equivalent PSL block

**Constraints:**

- IDB cannot infer field types — `manifest.schema` stores only store/index structure, not the shape of records stored in each store. The output would produce `fields: {}` for each model (or omit fields) and the user would need to add them manually.
- Unlike SQL/Mongo, there is no "live database" to connect to from Node.js — the manifest file IS the schema source. So this is pure manifest → contract translation, not a live introspection.
- The output format follows whatever `prisma-next contract infer` emits for SQL families (PSL or JSON) — check the framework's `PslContractInferCapable` interface for the expected return type.

---

## Phase 7 — Outbox sync

**Goal:** Bidirectional sync on top of the runtime.

Port the existing sync work from the generator to the new architecture:

- Outbox on the client, changelog materialization on the server
- Ownership DAG validation (the 4 core invariants from todo.md)

## Review findings (2026-05-25)

Audit comparing our six packages against the vendor reference implementation (`vendor/prisma-next/packages/2-mongo-family/*`, `2-sql/*`, `3-extensions/sql-orm-client/`, `3-extensions/mongo/`). What follows is **just the gaps not already enumerated in Phase 6.1-6.7**.

### ✅ Issue #1 — `MigrationRunner` missing `executeAcrossSpaces`, blocks CLI `db update` — FIXED

`executeAcrossSpaces` was implemented in [migration-runner.ts](packages/prisma-next/target-idb/src/core/migration-runner.ts). The CLI path B (all `db` subcommands) is now fully operational. The implementation also adds a fake-indexeddb DDL dry-run (with the manifest schema pre-seeded so drop ops are verifiable), a storageHash short-circuit so idempotent calls are no-ops, and writes `idbVersion` + `schema` back to the manifest on success.

### ✅ Issue #2 — `sign()` does not populate `manifest.schema` from contract — FIXED

`sign()` now writes `schema: schemaFromContract(contract)` ([control-instance.ts](packages/prisma-next/family-idb/src/core/control-instance.ts)) instead of preserving the old (potentially empty) schema. `db update` also writes the schema on success via `executeAcrossSpaces`, so both paths are consistent.

### ✅ Issue #3 — `createIdbClient` instantiates the adapter with `emptyCodecLookup` — FIXED

`idb-client.ts` now imports and uses `idbCodecLookup` from `@prisma-next-idb/target-idb/runtime` instead of `emptyCodecLookup`. The real codec lookup is wired through the full stack.

### ✅ Issue #4 — Missing stores treated as warnings in lenient schema verify — FIXED

`schema-verify.ts` now always emits `failNode` for a missing store regardless of `strict` mode. The `strict` flag governs only _extra_ entries not in the contract. The previously failing test now passes (family-idb: 60/60).

### ✅ Issue #5 — No `runtime-idb` test for streaming row coalescence with `onRow` middleware — DOCUMENTED

Not a code bug — the collect-then-yield behavior is a correct and unavoidable consequence of IDB's transaction model (ADR 006). The implications for middleware authors are now documented:

- **ADR 006** gained a "Middleware implications" section explaining why `onRow` backpressure doesn't reduce IDB reads, when to use `take(n)` instead, and how this diverges from the framework's streaming assumption.
- **`IdbMiddleware`** (`runtime-idb/src/idb-middleware.ts`) has an inline doc block warning middleware authors about the collect-then-yield constraint and directing them to ADR 006.

### ✅ Issue #6 — `RuntimeMiddlewareContext.scope` is hard-coded to `"runtime"` — RESOLVED

**Symptom.** `idb-runtime.ts` set `scope: "runtime"` unconditionally. The vendor framework's cache middleware skips caching inside transactions (scope `"transaction"`) to preserve read-after-write coherence.

**Fix (Phase 6.3).** `IdbTransactionScope.execute()` bypasses the `RuntimeCore` middleware chain entirely — it calls `executeOpInTx` directly inside the pre-opened IDB transaction. Because middleware never fires during scope execution, the cache middleware cannot incorrectly cache reads made inside a `withMutationScope()` block. The `scope: "runtime"` in `buildMiddlewareContext` remains correct for non-scoped (top-level) executions.

### ✅ Issue #7 — `contract.json` and `contract.d.ts` index `unique` field is inconsistent — FIXED

`verifyIndex()` in `schema-verify.ts` now normalises both sides with `?? false` before comparing — the same pattern already used for `multiEntry`. `undefined` and `false` are treated as equivalent, so `byAuthorId` (which omits `unique` in `contract.json`) no longer triggers a mismatch.

### Issue #8 — Filter shorthand cannot express `null`-check, only equality

**Symptom.** `db.users.where({ deletedAt: null }).all()` matches no rows even when there are rows with `deletedAt === null`, because `#buildFilter()` does `row[key] !== value` — and when value is `null`, IDB serializes the field as `undefined` if absent, so the comparison is `undefined !== null` → true → filter excludes the row.

**Impact.** Today's contract has no nullable scalars on User/Post, so this is latent. Will bite immediately when nullable fields are introduced.

**Fix sketch.** Phase 6.1 plan covers this with `IdbNullCheckExpr` + `shorthandToFilterExpr` that converts `value === null` to a `null-check` expression.

### ✅ Issue #9 — `prisma-next-usage` has no automated tests — FIXED

The demo app has been refactored into a thin query-runner shell (a textarea + JSON output panel, modeled on `apps/usage`) so Playwright specs drive the ORM directly through the assembled stack instead of clicking a hand-coded UI. The shell reads `?db=<name>` from the URL so each spec gets an isolated IDB database, and the helpers in `tests/helpers.ts` ship a `runner` fixture that resets the DB between tests.

Coverage (18 specs):

- `tests/smoke.spec.ts` — 6 specs covering Path A auto-migration plus every MVP `IdbStoreAccessor` terminal (`create`, `all`, `findUnique`, `delete`, `orderBy + take + skip`, `include` across a 1:N relation).
- `tests/operators.spec.ts` — 12 specs covering shorthand filtering with `null` and every Phase 6.1 operator (`eq`, `neq`, `gt`, `lt`, `gte`, `lte`, `in`, `notIn`, `contains`, `startsWith`, `endsWith`, `isNull`, `isNotNull`) plus all three combinators (`and`, `or`, `not`) including nested + chained compositions.

`playwright.config.ts` was switched from the `**/*.e2e.{ts,js}` shape to `testDir: "./tests"` so the standard `*.spec.ts` discovery works.

### ✅ Issue #10 — Module-level grouping key counter — FIXED

The `let _key = 0` counter now lives inside the `IdbStoreAccessorImpl` constructor as a closure variable, giving each root accessor its own counter. Builder-chain clones (`where()`, `take()`, `skip()`, etc.) receive the same `newGroupingKey` factory via `#clone()`, so all chained copies share one counter per root. Two separate `idbOrm()` clients no longer interleave keys.

### Open gaps (Phase 6.1–6.7)

- 6.1: Full operator API (`gt`, `lt`, `gte`, `lte`, `contains`, `startsWith`, `endsWith`, `in`, `notIn`, `not`, `AND`, `OR`, `isNull`) + Proxy-based `IdbModelAccessor`
- 6.2: `update`, `updateMany`, `upsert`, `createMany`, `deleteMany`, `count`
- 6.3: `IdbTransactionScope` + `withMutationScope()` in `client-idb`
- 6.4: Nested relation writes via `IdbRelationMutator`, `parseMutationInput`, `partitionByOwnership`, `createGraph`, `updateFirstGraph`
- 6.5: `include(rel, refineFn)` — refined child accessor state + `IdbIncludeScalar` for `count()`
- 6.6: Standalone `accessor.aggregate()` + `groupBy(field).aggregate(...)` via `IdbGroupedAccessor`
- 6.7: `select(...fields)` projection with FK augmentation for pending includes

### Recommended next steps

1. **Start Phase 6.1** (filter operators). Largest single quality-of-life jump; Mongo ORM has a clean pattern to port.
2. **Add at least one E2E spec** in `prisma-next-usage` (Issue #9) so the assembled stack has regression coverage.
3. **Fix Issue #6** (scope hard-coding) when Phase 6.3 lands — the fix is gated on `IdbTransactionScope` existing.

---

## Second-round review (2026-05-25, vendor cross-check)

Audit comparing our six packages against the cloned vendor reference (`vendor/prisma-next/`), particularly mongo-target (`packages/3-mongo-target/`), sqlite-target (`packages/3-targets/3-targets/sqlite/`), and the sql/mongo families. What follows is just the gaps not already enumerated in the first-round review or in Phase 6.1-6.7.

### ✅ Issue #11 — `executeBatchPlan` opens readonly for update-only batches — FIXED

**Symptom.** [packages/prisma-next/driver-idb/src/core/execute/index.ts:92](packages/prisma-next/driver-idb/src/core/execute/index.ts#L92) determined the transaction mode by checking only for `"put"` and `"delete"` op kinds. A batch consisting only of `update` ops (or any future write op other than put/delete) would open the IDB transaction in `readonly` and the inner `store.put(merged)` would abort with `ReadOnlyError`.

**Why this was hidden.** The existing tests in [packages/prisma-next/driver-idb/test/execute.test.ts](packages/prisma-next/driver-idb/test/execute.test.ts) only exercised batches with put/delete; the `update`-only path was never tested.

**Fix.** The condition now also includes `"update"`. A regression test was added that runs a batch of one `update` op and verifies the merged row is written back. `planTxMode()` (used by atomic plans) already had this right; the divergence between `planTxMode` and `executeBatchPlan` was the underlying defect.

### ✅ Issue #12 — `autoMigrate` plans from `fromContract: null` and breaks contract evolution — FIXED

**Symptom.** [packages/prisma-next/client-idb/src/core/auto-migrate.ts](packages/prisma-next/client-idb/src/core/auto-migrate.ts) called `planner.plan({ fromContract: null, ... })` regardless of the live IDB state. For a fresh database this produces a correct "create everything" plan. But when the user changes their contract (e.g. adds a `Post` model to an existing v1 database with a `User` store), the planner emits ops to create `User` AND `Post` AND the marker store. The runner then opens at the next IDB version and tries to `createObjectStore("users")` inside `upgradeneeded` — which aborts the version-change transaction because the store already exists.

**Impact.** The auto-migration path was only correct for two scenarios: the first run (empty DB) and re-opens with identical contracts. Any contract evolution broke. The demo app worked only because the manifest's pre-baked `idbVersion: 1` matched the initial signed contract — once a user changed `contract.server.ts` they would have hit this immediately on next browser load.

**Fix.** Added `introspectLiveDb()` which opens the existing DB, reads `objectStoreNames`/`indexNames`/`keyPath`/`unique`/`multiEntry` via the IDB introspection API, and constructs a synthetic `fromContract` object whose `storage.stores` matches the live schema. The planner now produces a true delta plan (only the new ops). Three regression tests cover v1→v2 (add store), v2→v3 (add index), and v1→v1 (identity no-op).

**Note.** SSR-aware mode (when the caller passes a `manifest` loaded server-side) still derives `targetVersion` from `manifest.idbVersion`. Introspection is purely a planner input — the manifest path's `idbVersion` continues to govern the IDB version bump.

### ✅ Issue #13 — `idbRuntimeAdapterDescriptor.create()` used `emptyCodecLookup` — FIXED

**Symptom.** First-round Issue #3 fixed `createIdbClient()`'s direct `new IdbAdapter(idbCodecLookup)` instantiation, but the framework-facing descriptor in [packages/prisma-next/adapter-idb/src/exports/runtime.ts](packages/prisma-next/adapter-idb/src/exports/runtime.ts) still constructed the adapter with `emptyCodecLookup`. Any code path that goes through the descriptor's `.create(stack)` factory (the canonical way per the vendor pattern — see `vendor/prisma-next/packages/3-mongo-target/2-mongo-adapter/src/exports/runtime.ts`) would silently get an adapter with no codec resolution.

**Impact.** Latent today (all `idb/*` codecs are identity), but pre-Phase 6.x non-identity codecs (`DateTime` → `Date`, custom user codecs) would silently mis-route through the descriptor path.

**Fix.** The descriptor now imports `idbCodecLookup` from `@prisma-next-idb/target-idb/runtime` and passes it to `new IdbAdapter(...)`. The hand-constructed adapter in `createIdbClient` and the descriptor-built adapter now agree.

### ✅ Issue #14 — Migration TS renderer emits `unique: undefined` — FIXED

**Symptom.** [packages/prisma-next/target-idb/src/core/migration-planner.ts:97](packages/prisma-next/target-idb/src/core/migration-planner.ts#L97) rendered the `unique` field via `String(op.def.unique)`. When the contract canonicaliser stripped `unique: false` (default-stripping behaviour), `op.def.unique` was `undefined` and `String(undefined)` produced the literal string `"undefined"`. The emitted `migration.ts` then contained `createIndexOp("posts", "byAuthorId", { keyPath: "authorId", unique: undefined })` — invalid TypeScript under `exactOptionalPropertyTypes: true` and ambiguous at runtime.

**Visible in this repo.** [apps/prisma-next-usage/migrations/app/20260525T1045_migration/migration.ts:8](apps/prisma-next-usage/migrations/app/20260525T1045_migration/migration.ts#L8) was the example. The app's own tsconfig isn't strict on this so typecheck passed, but the file is shipping bad code.

**Fix.** The renderer now defaults missing `unique` to `false` before string-formatting, matching IDB's own default in `IDBObjectStore.createIndex`. A regression test covers the omitted-unique case.

### ✅ Issue #16 — `IdbMiddleware` used non-SPI field `family: "idb"` — FIXED

**Symptom.** [packages/prisma-next/runtime-idb/src/idb-middleware.ts:25-27](packages/prisma-next/runtime-idb/src/idb-middleware.ts#L25) declared `readonly family: "idb"`. The framework SPI (`RuntimeMiddleware` in `vendor/prisma-next/packages/1-framework/1-core/framework-components/src/execution/runtime-middleware.ts`) defines `familyId?: string` and the vendor families (`MongoMiddleware`, `SqlMiddleware`) narrow it to `familyId?: 'mongo'` / `familyId?: 'sql'`. Using a non-standard `family` field meant:

1. Cross-family middleware (e.g. `@prisma-next/middleware-cache`) that declared `familyId?: undefined` was not assignable to our middleware array.
2. The framework's `checkMiddlewareCompatibility()` helper, which reads `familyId`, would see our middleware as cross-family rather than IDB-specific.

**Fix.** Renamed to `familyId?: "idb"` matching the vendor pattern. The narrowing is optional so cross-family middleware drops in cleanly. All existing tests updated.

### ✅ Issue #15 — `diffIdbSchema` doesn't detect mutations to existing indexes — FIXED

**Symptom.** [packages/prisma-next/target-idb/src/core/schema-diff.ts](packages/prisma-next/target-idb/src/core/schema-diff.ts) only detected three kinds of index changes: new index added, index removed, store added with indexes. Changes to an _existing_ index (e.g. `unique: false → true`, `keyPath: "name" → "lastName"`, `multiEntry` toggling) produced an empty diff. The new contract's storageHash silently mismatched the marker and the user got mysterious schema drift forever.

**Fix.** `diffIdbSchema` now walks each surviving index pair and compares `keyPath` / `unique` / `multiEntry` (with `unique`/`multiEntry` defaulting to `false` for canonicaliser-stripped contracts). When any of those differ, it emits a `dropIndex` op followed by a `createIndex` op — IDB has no in-place alter for indexes. Six unit tests cover the new paths and one client-idb e2e test asserts that loosening a `unique:true` index lets two records share the same indexed value through the full auto-migration flow.

**Store-level mutations.** As a related correctness guard, the diff also throws if an existing store's `keyPath` or `autoIncrement` flag changes — IDB cannot alter those without dropping the store, and silent no-op is worse than an explicit error. The recovery path is an explicit manual migration that drops + recreates the store with whatever data-preservation strategy the caller wants.

### ✅ Notes on what's _not_ a bug

- **Codec descriptors placement on the target, not the adapter.** Mongo places `codecDescriptors` on the adapter descriptor (`vendor/prisma-next/packages/3-mongo-target/2-mongo-adapter/src/exports/runtime.ts`). Sqlite places them on the target (no codecs export from the SQL adapter). We chose the sqlite pattern (codecs on `target-idb`), which is correct for a target-only family. Either works structurally — the framework consumes from whichever descriptor exposes `types.codecTypes.codecDescriptors`.
- **`autoMigrate` always passing policy `ALLOW_ALL`.** First-round notes flagged this implicitly. ADR-008 Path A is "browser-side single-user" — there is no separate deploy review step. `ALLOW_ALL` is intentional. The CLI's `db update` (Path B) uses a tighter default policy.
- **Manifest writes happen in `executeAcrossSpaces`, not `execute`.** This looked weird relative to SQL/Mongo (which write the marker inside the same DB transaction as the DDL), but IDB cannot reach the manifest from inside the version-change transaction (the manifest is a Node-side file). The fake-IDB dry-run + manifest write pattern is the closest equivalent.

### Recommended next steps (updated 2026-05-26)

With Phase 6.2 and Issue #6 shipped, the queue is:

1. **Phase 6.4** — Nested relation writes (`create`/`connect`/`disconnect` inside `create`/`update`). Requires Phase 6.3 (now done). Port `parseMutationInput`, `partitionByOwnership`, `createGraph`, `updateFirstGraph`, `IdbRelationMutator` from sql-orm-client.
2. **Phase 6.5** — Include refinement (`include(rel, refineFn)`). Port refined child accessor state + `IdbIncludeScalar` for `count()`.
3. **Phase 6.6** — Aggregate / groupBy. `IdbGroupedAccessor`, `createAggregateBuilder`, standalone `accessor.aggregate()`.
4. **Phase 6.7** — Select projection. `selectedFields` in state, post-load field stripping, FK augmentation for includes.

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
