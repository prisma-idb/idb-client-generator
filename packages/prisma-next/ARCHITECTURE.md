# Prisma Next IDB — Package Architecture

This document covers the full mental model for the six packages in `packages/prisma-next/`: what each one is, why it exists, what every entrypoint contains, and how they connect to each other.

---

## The Big Idea: Two Planes

Prisma Next separates all code into two execution planes. Understanding this split is the foundation for everything else.

| Plane             | Also called      | Runs where              | Purpose                                      |
| ----------------- | ---------------- | ----------------------- | -------------------------------------------- |
| **Control plane** | build-time / CLI | Node.js (never browser) | Schema migration, introspection, CLI tooling |
| **Runtime plane** | execution plane  | Browser (or Node.js)    | Actual query execution against the database  |

Every package in this family respects this split. Code that does DDL (creating object stores, running migrations) is **control plane only** — it must never land in a browser bundle. Code that executes a `findMany` is **runtime plane**.

---

## The Six Layers

A Prisma Next database family is composed of six layers. Each layer has a specific responsibility and a specific location in the call stack.

```
User's app code
        │
        ▼
   [ client-idb ]      ← typed ORM surface (idbOrm)
        │
        ▼
   [ runtime-idb ]     ← wires adapter + driver into RuntimeCore
        │
        ▼
   [ adapter-idb ]     ← translates query plan → IDB operation body
        │
        ▼
   [ driver-idb ]      ← executes the plan against indexedDB
        │
        ▼
   [ target-idb ]      ← identity + codecs + migration system
        │
        ▼
   window.indexedDB
        │
        ▲
   [ family-idb ]      ← control plane only; CLI integration
```

### Analogy: a restaurant kitchen

- **client-idb** — the waiter/menu. Takes the customer's order in typed, familiar terms (`db.users.create({…})`) and hands a structured ticket to the kitchen.
- **runtime-idb** — the expeditor. Coordinates the prep cook and line cook, verifies the recipe version matches, runs quality checks (middleware).
- **adapter-idb** — the prep cook. Takes an order ticket and turns it into specific actions ("slice onions, brown beef") using the recipe book.
- **driver-idb** — the line cook. Executes those specific actions against the actual stove (IndexedDB API). Doesn't know or care about recipes.
- **target-idb** — the recipe book + kitchen rulebook. Defines what the food is, how ingredients map to dishes (codecs), and how to upgrade the kitchen equipment (migrations).
- **family-idb** — the restaurant manager. Knows the whole operation, talks to suppliers (CLI), knows the menu contract. Never cooks.

---

## Package Reference

### `@prisma-next-idb/target-idb`

**What it is:** The IDB family's identity declaration + migration system.

**Analogies:** recipe book, passport, rulebook.

**Entrypoints:**

| Entrypoint     | Plane               | What it contains                                                                                                                            | Who imports it                                                  |
| -------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `.` / `./pack` | neither (pure data) | `{ kind: 'target', familyId: 'idb', targetId: 'idb', version, capabilities }` as a typed const                                              | adapter `/pack`, family-idb, anyone needing the identity object |
| `./control`    | control only        | `IDBMigrationRunner`, DDL op factories (`createObjectStore`, `createIndex`), schema diffing, marker ledger                                  | CLI, family-idb, migration tooling                              |
| `./runtime`    | runtime only        | `RuntimeTargetDescriptor` with `codecs()` + `create()` factory                                                                              | Execution stack at query time                                   |
| `./migration`  | control only        | Re-exports the DDL op factories (`createObjectStore`, `createIndex`, `dropObjectStore`, `createIDBIndex`) for user-authored migration files | User migration files                                            |

**Why `/pack` and `/control` are separate:**
`/control` contains the migration runner and schema diffing. If these were bundled with `/pack`, every browser bundle importing the target would carry the entire migration system. By keeping them separate, only Node.js/CLI code ever imports `/control`.

**Key type: `capabilities`**
The capabilities object declares what IDB can and cannot do. For example:

- `transactionalDDL: true` — IDB's `upgradeneeded` IS a version-change transaction
- `ddlOnlyInUpgrade: true` — DDL can ONLY happen inside `upgradeneeded` (custom IDB constraint)
- `returning: false` — IDB has no `RETURNING` clause
- `compoundKeys: false` — forbidden by sync ownership invariants

---

### `@prisma-next-idb/adapter-idb`

**What it is:** The translation layer between Prisma's query AST and IDB operation bodies.

**Analogy:** the prep cook's instruction sheet — translates "findMany where age > 18 orderBy name" into a concrete sequence of IDB cursor operations.

**Entrypoints:**

| Entrypoint  | Plane        | What it contains                                                                                                                                | Who imports it                |
| ----------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `./control` | control only | `ControlAdapterDescriptor` with `scalarTypeDescriptors` (Prisma type → IDB codec ID map), schema introspector, helpers for the migration runner | CLI, family-idb               |
| `./runtime` | runtime only | `RuntimeAdapterDescriptor` with a `lower(queryAST)` method that produces opaque plan bodies the driver can execute                              | Execution stack at query time |

**`scalarTypeDescriptors` explained:**
This is how the framework knows how to store each Prisma type. Example:

```ts
scalarTypeDescriptors: new Map([
  ["String", "idb/string@1"],
  ["Int", "idb/int32@1"],
  ["Float", "idb/double@1"],
  ["Boolean", "idb/bool@1"],
  ["DateTime", "idb/date@1"],
  ["BigInt", "idb/bigint@1"],
  ["Decimal", "idb/decimal@1"],
  ["Json", "idb/json@1"],
  ["Bytes", "idb/bytes@1"],
]);
```

**Depends on:** `target-idb` (needs the target's pack identity and codec type surface).

---

### `@prisma-next-idb/driver-idb`

**What it is:** The `window.indexedDB` execution wrapper — takes the adapter's opaque plan bodies and actually runs them against IDB.

**Analogy:** the line cook. Given a concrete ticket ("open cursor on 'users' store, filter where age > 18"), executes it. Does not know what query was originally asked.

**Entrypoints:**

| Entrypoint  | Plane        | What it contains                                                                                                      | Who imports it                |
| ----------- | ------------ | --------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `./control` | control only | `ControlDriverDescriptor` with a `create()` async factory that opens an IDB database connection for CLI/migration use | CLI                           |
| `./runtime` | runtime only | The actual `IDBDriverImpl` class + `createIDBDriver()` factory — executes plan bodies against `window.indexedDB`      | Execution stack at query time |

**Why the driver has `/control`:**
Even though IDB is browser-native, the CLI needs to open an IDB-like connection to run migrations (e.g. in a test environment, or via a server-side IDB polyfill). The `ControlDriverDescriptor` is the CLI's hook to do that. The `/control` entrypoint is also where the driver registers its version with the framework.

**Does NOT depend on `adapter-idb`.** The driver only knows about plan bodies (opaque objects the adapter produced). It does not need to understand how those bodies were created. The dependency direction is:

```
driver (no deps on adapter)
adapter → target
family → target
runtime-idb → adapter, driver
client-idb → target, adapter, driver
```

---

### `@prisma-next-idb/runtime-idb`

**What it is:** The `RuntimeCore` subclass for IndexedDB. Wires the adapter and driver together into a single `execute(plan)` method, verifies the contract marker, and runs the middleware lifecycle.

**Analogy:** the kitchen expeditor. Takes the waiter's ticket, coordinates the prep cook (adapter) and line cook (driver), verifies the recipe version hasn't changed, and enforces quality checks (middleware).

**Entrypoints:**

| Entrypoint  | Plane        | What it contains                                                                                                             | Who imports it       |
| ----------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `./runtime` | runtime only | `createIdbRuntime({ adapter, driver, contract })` factory + `IdbRuntime` interface + `IdbMiddleware` type + `verifyMarker()` | User app, client-idb |

**Key methods on `IdbRuntime`:**

| Method           | What it does                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `execute(plan)`  | Lowers the plan via the adapter, runs it via the driver, yields typed rows                |
| `verifyMarker()` | Compares the live `_prisma_next_marker` store's `storageHash` against the contract's hash |
| `close()`        | Closes the IDB database connection via the driver                                         |

**`verifyMarker()` explained:**
Before executing queries, the runtime reads the `_prisma_next_marker` object store (created by the migration runner) and compares the stored `storageHash` against `contract.storage.storageHash`. A match means the live schema matches what the contract expects. A mismatch means a migration is needed. A missing marker means the database was never initialised.

**Middleware:**
The runtime accepts an optional `middleware` array of `IdbMiddleware` objects. Each middleware has:

- `family: "idb"` — discriminant so only IDB-compatible middleware is accepted
- `beforeExecute(plan, ctx)` — called before the driver runs
- `onRow(row, plan, ctx)` — called for every row yielded by the driver
- `afterExecute(plan, ctx)` — called after the driver finishes

**`RuntimeMiddlewareContext` construction (`buildMiddlewareContext()`):**
When the caller doesn't supply a `ctx`, the runtime builds one from the contract:

- `contract` — the contract object itself, available for middleware introspection (model layout, hashes)
- `mode: "permissive"` — non-strict semantics for parse/decode boundary
- `log` — no-op stubs (info/warn/error); user supplies their own via `ctx` override
- `now: Date.now` — wall-clock provider
- `scope: "runtime"` — fixed today; will switch to `"transaction"` when `withMutationScope()` lands (Phase 6.3)
- `contentHash(exec)` — canonicalizes the lowered plan, hashes via WebCrypto SHA-512. Functions (`IdbRowFilter`, `IdbRowComparator`) are skipped; `IDBKeyRange` is reduced to `{ lower, upper, lowerOpen, upperOpen }`. Output is stable across equivalent queries — suitable as a `@prisma-next/middleware-cache` cache key.

Note: collect-then-yield (ADR 006) means `onRow` fires after all rows have already been materialized inside the IDB transaction. The hook runs as a sequence over the in-memory array, not as backpressure into the cursor — see Phase 6 review notes in `PLAN.md`.

**Depends on:** `adapter-idb` (for `lower()`), `driver-idb` (for `execute()`, `readMarker()`, `close()`).

---

### `@prisma-next-idb/client-idb`

**What it is:** The typed ORM surface — `idbOrm({ contract, executor })` returns a client where every model in the contract becomes a typed accessor with methods like `.create()`, `.all()`, `.where()`, `.first()`, `.delete()`. Also ships two higher-level entrypoints (`./client`, `./client-auto`) that assemble the whole runtime stack so user code doesn't need to wire driver/adapter/runtime by hand.

**Analogy:** the waiter and menu. The customer (app code) writes `db.users.create({ name: "Alice" })` — the client translates this into an `IdbQueryPlan` and hands it to the runtime executor.

**Entrypoints:**

| Entrypoint      | Plane        | What it contains                                                                                                                                                | Who imports it |
| --------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `./orm`         | runtime only | `idbOrm({ contract, executor })` factory + `IdbOrmClient` type + `IdbStoreAccessor` type. Bring-your-own runtime (you pass any `IdbQueryExecutor`).             | Advanced users |
| `./client`      | runtime only | `createIdbClient({ contract, dbName, middleware? })` — assembles `driver + adapter + runtime + orm` and returns `{ orm, verifyMarker, close, [asyncDispose] }`. | Most user apps |
| `./client-auto` | runtime only | `createAutoMigratingIdbClient({ contract, dbName, manifest? })` — same as `./client` but runs the migration planner+runner first if marker doesn't match.       | SPA / Path A   |

**Key types:**

| Type                    | What it is                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `IdbOrmClient<T>`       | A mapped type over `contract.roots` — each root key becomes an `IdbStoreAccessor` property          |
| `IdbStoreAccessor<T,M>` | Typed per-model accessor with `create()`, `all()`, `where()`, `first()`, `findUnique()`, `delete()` |
| `IdbQueryExecutor`      | A thin interface: `execute<Row>(plan: IdbQueryPlan<Row>): AsyncIterableResult<Row>`                 |
| `WhereFilter<T,M>`      | Typed filter shape matching the model's fields                                                      |

**How it works:**

1. `idbOrm()` reads `contract.roots` (e.g. `{ users: "User", posts: "Post" }`)
2. For each root, it instantiates an `IdbStoreAccessorImpl` targeting the model
3. When you call `db.users.create({ name: "Alice" })`, the accessor:
   - Generates a client-side `id` (uuid/cuid)
   - Builds an `IdbQueryPlan` with an `IdbPutPlan` body
   - Calls `executor.execute(plan)`
4. The executor is typically an `IdbRuntime` — which lowers the plan via the adapter and runs it via the driver

**`groupingKey` on plan meta:**
Every `IdbQueryPlan` emitted by the ORM carries a `groupingKey` in its `meta.annotations` — a unique string like `"idb-op-1"`, `"idb-op-2"`. This key propagates through sub-plans (e.g. relation loads) so middleware can correlate operations.

**Intermediate AST on plans:**
Each plan carries an optional `ast` field (`IdbQueryAst`) describing the query intent (`findMany`, `findUnique`, `create`, `delete`). This lets middleware inspect query structure without parsing opaque plan bodies.

**Depends on:** `target-idb` (for contract types), `adapter-idb` (for `IdbQueryPlan` shape), `driver-idb` (for `IdbPlanBody` types). Does NOT depend on `runtime-idb` — the executor interface is structural.

---

### `@prisma-next-idb/family-idb`

**What it is:** The control-plane integration point for the IDB family. This is what a `prisma.config.ts` or CLI flow imports. It is **never imported in browser code**.

**Analogy:** the restaurant manager. Knows the full family setup, assembles it for the CLI, validates contracts. Does not cook anything.

**Entrypoints:**

| Entrypoint       | Plane               | What it contains                                                                                                                                                                                                                                                                        | Who imports it                |
| ---------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `./control`      | control only        | Default export `IdbFamilyDescriptor` + `IdbManifestControlDriverDescriptor` + type re-exports (`IdbContract`, `IdbManifest`, `IdbSchemaIR`)                                                                                                                                             | `prisma-next.config.ts`, CLI  |
| `./pack`         | neither (pure data) | The family's pure pack ref — passed to `defineContract({ family, ... })` so the contract is bound to the IDB family identity                                                                                                                                                            | `contract.ts` authoring files |
| `./contract-ts`  | neither (pure data) | `defineContract(input)` — TypeScript-first authoring helper. Takes `{ family, target, models: { ModelName: { store, key, indexes?, relations? } } }`, derives the full `Contract<IdbStorage>` object with `storageHash` + `profileHash` computed, validates it, returns. No PSL needed. | `contract.ts` authoring files |
| `./config-types` | control only        | `defineConfig()` re-export for `prisma-next.config.ts`, plus `typescriptContract()` helper that ties a TS-authored contract to its emitted `contract.json` path                                                                                                                         | `prisma-next.config.ts`       |

**There is no `./runtime` entrypoint.** Runtime stack composition is done by `client-idb` via `createIdbClient()` (or `createAutoMigratingIdbClient()`).

**Manifest format (`prisma-idb.manifest.json`):**

```json
{
  "version": 1,
  "idbVersion": 1,
  "schema": { "stores": { "users": { "keyPath": "id", "indexes": { ... } } } },
  "marker": {
    "storageHash": "sha256:...",
    "profileHash": "sha256:...",
    "updatedAt": "2026-05-25T05:58:37.985Z",
    "invariants": [], "contractJson": null,
    "canonicalVersion": null, "appTag": null, "meta": {}
  }
}
```

`version` is the **manifest file format** version (always `1`). `idbVersion` is the **IndexedDB version number** the runner last opened the database at — bumped on every successful `db update`. `schema` is the IR diff target (currently populated only when `db update` runs successfully — see PLAN.md Issue #2). `marker` mirrors what's written into the `_prisma_next_marker` store after each migration; `db sign` writes only the marker portion.

**Depends on:** `target-idb` only. The family descriptor needs the target's `/pack` metadata to expose `idbTargetDescriptor` to the CLI. It does not depend on the adapter or driver — those are the user's runtime concern.

---

## Entrypoint Flow Diagrams

### Control plane (CLI runs `db migrate`)

```
prisma.config.ts
  └── imports family-idb/control
        └── idbFamilyDescriptor + idbTargetDescriptor
              │
              ├── CLI calls familyInstance.validateContract(contractJson)
              ├── CLI calls familyInstance.schemaVerify({ driver, contract })
              │     └── driver-idb/control ← ControlDriverDescriptor.create(url) opens IDB
              └── CLI calls familyInstance.runMigrations({ driver, plan })
                    └── target-idb/control ← IDBMigrationRunner
                          └── calls createObjectStore, createIndex
                                inside the upgradeneeded callback
```

### Runtime plane (user calls `db.users.all()` or `db.users.create({…})`)

```
User's app
  ├── import { idbOrm } from "@prisma-next-idb/client-idb/orm"
  ├── import { createIdbRuntime } from "@prisma-next-idb/runtime-idb/runtime"
  └── import contract from "./prisma/idb-contract"
        │
        ├── const runtime = createIdbRuntime({ adapter, driver, contract })
        │     ├── runtime.verifyMarker()  // checks _prisma_next_marker store
        │     ├── adapter-idb/runtime ← lower(plan, { contract }) → IdbPlanBody
        │     └── driver-idb/runtime ← execute(planBody) → async iterable rows
        │
        └── const db = idbOrm({ contract, executor: runtime })
              │
              ├── db.users.create({ name: "Alice" })
              │     └── builds IdbQueryPlan { idbPlan: IdbPutPlan, meta: { groupingKey: "idb-op-1" } }
              │     └── runtime.execute(plan) → AsyncIterableResult<Row>
              │
              └── db.users.all()
                    └── builds IdbQueryPlan { idbPlan: IdbCursorScanPlan }
                    └── runtime.execute(plan)
                          ├── adapter.lower(plan, { contract }) → IdbPlanBody
                          ├── middleware.beforeExecute(planBody, ctx)
                          ├── driver.execute(planBody) → yield rows
                          │     └── middleware.onRow(row, planBody, ctx) per row
                          └── middleware.afterExecute(planBody, ctx)
```

---

## Dependency Graph

```
family-idb ──────────────────┐
                              │ (depends on)
target-idb ◄──────────────── adapter-idb ◄────── runtime-idb
     ▲                                              ▲
     └── family-idb                                 │
                                              client-idb
                                                    │
driver-idb ◄────────────────────────────────────────┘

client-idb depends on target-idb, adapter-idb, driver-idb
runtime-idb depends on adapter-idb, driver-idb
```

- `adapter-idb` → `target-idb` (needs target pack identity and codec types)
- `family-idb` → `target-idb` (needs pack metadata to build control descriptors)
- `driver-idb` → nothing in this family (only needs framework-components types)
- `runtime-idb` → `adapter-idb`, `driver-idb` (wires `lower()` + `execute()` + `readMarker()` into a `RuntimeCore`)
- `client-idb` → `target-idb`, `adapter-idb`, `driver-idb` (needs contract types, plan shapes, and plan body types)

---

## Key Terminology

| Term                         | Meaning                                                                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Descriptor**               | A pure-data object that describes a layer (target/adapter/driver/family). Contains identity fields + factory methods. Never has mutable state.                                                            |
| **Instance**                 | A live object created from a descriptor's `create()` method. Has the actual connection, open cursors, etc.                                                                                                |
| **ControlFamilyDescriptor**  | The top-level descriptor for a family. The CLI calls `create(stack)` on it to get a family instance for migrations.                                                                                       |
| **ControlDriverDescriptor**  | The driver's control-plane descriptor. Has `create(url)` to open a connection for CLI use.                                                                                                                |
| **ControlAdapterDescriptor** | The adapter's control-plane descriptor. Has `scalarTypeDescriptors` mapping Prisma types to storage codec IDs.                                                                                            |
| **RuntimeTargetDescriptor**  | Target's runtime descriptor. Has `codecs()` (codec registry) and `create()` (target instance factory). Used by the execution stack.                                                                       |
| **RuntimeAdapterDescriptor** | Adapter's runtime descriptor. Has `create(stack)` and `lower(queryAST)`. Lowers Prisma queries to IDB plan bodies.                                                                                        |
| **pack**                     | The plain identity object for a target: `{ kind, familyId, targetId, id, version, capabilities }`. The default export of any target package.                                                              |
| **familyId**                 | Identifies the database family. For us: `'idb'`. For Mongo: `'mongo'`.                                                                                                                                    |
| **targetId**                 | Identifies the specific target within a family. For a single-target family: same as `familyId`.                                                                                                           |
| **capabilities**             | A typed object on the pack declaring what the target can/cannot do (e.g. `transactionalDDL`, `returning`, `compoundKeys`). The framework uses this to gate features.                                      |
| **codec**                    | A serializer/deserializer for a single scalar type. e.g. a `DateTime` codec converts between JS `Date` and whatever IDB stores.                                                                           |
| **codec registry**           | A collection of codecs for all scalar types the target supports. Returned by `RuntimeTargetDescriptor.codecs()`.                                                                                          |
| **codec ID**                 | A versioned string ID for a codec, e.g. `idb/date@1`. The `@1` is the version — different versions of the same codec can coexist.                                                                         |
| **scalarTypeDescriptors**    | The map on `ControlAdapterDescriptor` from Prisma type names (`'DateTime'`) to codec IDs (`'idb/date@1'`).                                                                                                |
| **marker ledger**            | The system that tracks which migration has been applied to an IDB database. Stored as a special entry inside IDB itself.                                                                                  |
| **upgradeneeded**            | The IDB callback that fires when `IDBFactory.open(name, newVersion)` is called with a version higher than the stored version. DDL (object store creation/deletion) can ONLY happen here.                  |
| **opaque plan body**         | The output of `adapter.lower(queryAST)`. It's a data structure the driver knows how to execute, but the adapter doesn't need to know the driver's internals to produce it.                                |
| **ORM client**               | The typed object returned by `idbOrm({ contract, executor })`. Maps contract roots to `IdbStoreAccessor` instances. The user-facing query API.                                                            |
| **store accessor**           | A per-model typed query builder returned by the ORM client. Has methods like `create()`, `all()`, `where()`, `first()`, `findUnique()`, `delete()`.                                                       |
| **groupingKey**              | A unique string (e.g. `"idb-op-1"`) attached to every plan emitted by the ORM. Propagates through sub-plans so middleware can correlate related operations.                                               |
| **contract marker**          | A record in the `_prisma_next_marker` object store containing `storageHash`, `profileHash`, and `updatedAt`. Written by the migration runner, verified by `runtime.verifyMarker()`.                       |
| **outbox sync**              | The bidirectional sync extension (separate from these packages). Client writes go to an outbox first; a background process syncs them to the server. Lives in a separate `extension-outbox-sync` package. |

---

## What We Are NOT Building

To keep scope clear:

- **No `@prisma-next-idb/idb` facade** — there is no user-facing one-package wrapper. Users compose the runtime stack directly. Prisma Next has no equivalent `@prisma-next/mongo` package.
- **No codegen in these packages** — the existing `packages/generator` still handles code generation via `@prisma/generator-helper`. These packages are the Prisma Next SPI implementation.
- **No SQL** — IDB is a document/key-value store. There is no SQL surface here. The adapter lowers directly from Prisma's ORM query AST to IDB cursor operations.

---

## File Structure (target state)

```
packages/prisma-next/
├── target-idb/
│   ├── package.json          ← exports: . /pack /control /runtime /migration
│   ├── tsconfig.json
│   └── src/
│       ├── core/
│       │   ├── descriptor-meta.ts      ← { kind, familyId, targetId, capabilities }
│       │   ├── capabilities.ts         ← IDB capability flags
│       │   ├── migration-factories.ts  ← createObjectStore, createIndex, etc.
│       │   ├── migration-runner.ts     ← IDBMigrationRunner (orchestrates upgradeneeded)
│       │   ├── migration-planner.ts    ← contract→schema IR diffing + marker store op
│       │   ├── schema-diff.ts          ← contract-to-contract diffing
│       │   └── marker-ledger.ts        ← read/write applied migration version
│       └── exports/
│           ├── pack.ts        ← default export: idbTargetDescriptorMeta
│           ├── control.ts     ← re-exports runner, factories, diff, ledger
│           ├── runtime.ts     ← RuntimeTargetDescriptor (codecs + create)
│           └── migration.ts   ← re-exports user-facing op factories
│
├── adapter-idb/
│   ├── package.json          ← exports: /control /runtime
│   ├── tsconfig.json
│   └── src/
│       ├── core/
│       │   ├── codecs.ts                 ← IDB codec implementations
│       │   ├── idb-adapter.ts            ← lower(plan, ctx) → IdbPlanBody
│       │   ├── idb-query-ast.ts          ← IdbQueryAst (findMany / findUnique / create / delete)
│       │   ├── idb-query-plan.ts         ← IdbQueryPlan shape
│       │   ├── runtime-adapter-instance.ts ← IdbRuntimeAdapterInstance + IdbLowererContext
│       │   └── introspect-schema.ts
│       └── exports/
│           ├── control.ts    ← ControlAdapterDescriptor + scalarTypeDescriptors
│           └── runtime.ts    ← RuntimeAdapterDescriptor + lower()
│
├── driver-idb/
│   ├── package.json          ← exports: /control /runtime
│   ├── tsconfig.json
│   └── src/
│       ├── core/
│       │   ├── driver-info.ts      ← version constant
│       │   ├── plan-body.ts        ← IdbPlanBody union, MARKER_STORE_NAME, IdbMarkerRecord
│       │   ├── idb-driver.ts       ← IdbRuntimeDriverInstance (open, execute, readMarker, close)
│       │   └── execute/            ← plan body execution helpers
│       └── exports/
│           ├── control.ts    ← ControlDriverDescriptor + create(dbName)
│           └── runtime.ts    ← createIDBRuntimeDriver() factory + IdbRuntimeDriverInstance
│
├── runtime-idb/
│   ├── package.json          ← exports: ./runtime
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── test/
│   │   └── runtime.test.ts
│   └── src/
│       ├── idb-runtime.ts       ← IdbRuntimeImpl (extends RuntimeCore), createIdbRuntime()
│       ├── idb-middleware.ts    ← IdbMiddleware interface (family: "idb")
│       └── exports/
│           └── runtime.ts       ← re-exports createIdbRuntime, IdbRuntime, IdbMiddleware
│
├── client-idb/
│   ├── package.json          ← exports: ./orm
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── test/
│   │   └── orm.test.ts
│   └── src/
│       ├── core/
│       │   ├── idb-orm.ts          ← idbOrm() factory, IdbOrmClient type
│       │   ├── store-accessor.ts   ← IdbStoreAccessorImpl (create, all, where, first, findUnique, delete)
│       │   ├── executor.ts         ← IdbQueryExecutor interface
│       │   ├── relation-loader.ts  ← include() / relation traversal
│       │   ├── store-state.ts      ← per-store groupingKey counter
│       │   └── types.ts            ← IdbContract, WhereFilter, CreateInput, etc.
│       └── exports/
│           └── orm.ts              ← re-exports idbOrm, IdbOrmClient, IdbStoreAccessor, etc.
│
└── family-idb/
    ├── package.json          ← exports: /control /pack
    ├── tsconfig.json
    └── src/
        ├── core/
        │   ├── control-descriptor.ts   ← IDBFamilyDescriptor
        │   ├── control-instance.ts     ← createIDBFamilyInstance()
        │   └── idb-target-descriptor.ts ← built from target-idb/pack
        └── exports/
            ├── control.ts   ← idbFamilyDescriptor, idbTargetDescriptor
            └── pack.ts      ← pure family pack ref for contract.ts authoring
```
