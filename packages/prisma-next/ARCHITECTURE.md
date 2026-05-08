# Prisma Next IDB — Package Architecture

This document covers the full mental model for the four packages in `packages/prisma-next/`: what each one is, why it exists, what every entrypoint contains, and how they connect to each other.

---

## The Big Idea: Two Planes

Prisma Next separates all code into two execution planes. Understanding this split is the foundation for everything else.

| Plane             | Also called      | Runs where              | Purpose                                      |
| ----------------- | ---------------- | ----------------------- | -------------------------------------------- |
| **Control plane** | build-time / CLI | Node.js (never browser) | Schema migration, introspection, CLI tooling |
| **Runtime plane** | execution plane  | Browser (or Node.js)    | Actual query execution against the database  |

Every package in this family respects this split. Code that does DDL (creating object stores, running migrations) is **control plane only** — it must never land in a browser bundle. Code that executes a `findMany` is **runtime plane**.

---

## The Four Layers

A Prisma Next database family is composed of four layers. Each layer has a specific responsibility and a specific location in the call stack.

```
User's config / CLI
        │
        ▼
   [ family ]          ← control plane only; wires everything for the CLI
        │
        ▼
   [ target ]          ← identity + migration system + codec declarations
        │
        ▼
   [ adapter ]         ← translates Prisma query AST → storage-specific plan
        │
        ▼
   [ driver ]          ← executes the plan against the actual database API
        │
        ▼
   window.indexedDB
```

### Analogy: a restaurant kitchen

- **family** — the restaurant manager. Knows the whole operation, talks to suppliers (CLI), knows the menu contract. Never cooks.
- **target** — the recipe book + kitchen rulebook. Defines what the food is, how ingredients map to dishes (codecs), and how to upgrade the kitchen equipment (migrations).
- **adapter** — the prep cook. Takes an order (query AST) and turns it into a set of specific actions ("slice onions, brown beef") using the recipe book.
- **driver** — the line cook. Executes those specific actions against the actual stove (IndexedDB API). Doesn't know or care about recipes.

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
```

---

### `@prisma-next-idb/family-idb`

**What it is:** The control-plane integration point for the IDB family. This is what a `prisma.config.ts` or CLI flow imports. It is **never imported in browser code**.

**Analogy:** the restaurant manager. Knows the full family setup, assembles it for the CLI, validates contracts. Does not cook anything.

**Entrypoints:**

| Entrypoint  | Plane               | What it contains                                                                                                              | Who imports it                |
| ----------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `./control` | control only        | `idbFamilyDescriptor` (`ControlFamilyDescriptor`), `idbTargetDescriptor`, `createIDBFamilyInstance()`                         | `prisma.config.ts`, CLI       |
| `./pack`    | neither (pure data) | The family's pure pack ref — used by `defineContract(...)` in TypeScript authoring flows to bind a contract to the IDB family | `contract.ts` authoring files |

**There is no `./runtime` that does anything.** If `family-idb/runtime` exists, it only exports identity types — no creation helpers. Runtime stack composition is done directly by the user via `createRuntimeStack({ target, adapter, driver })`.

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

### Runtime plane (user calls `db.orm.users.findMany(...)`)

```
User's app
  └── createRuntimeStack({
        target: (await import('target-idb/runtime')).default,
        adapter: (await import('adapter-idb/runtime')).default,
        driver:  (await import('driver-idb/runtime')).default,
      })
        │
        ├── target-idb/runtime ← RuntimeTargetDescriptor.create() → target instance
        │     └── .codecs() → IDB codec registry (how DateTime etc. serialize)
        ├── adapter-idb/runtime ← RuntimeAdapterDescriptor.create(stack) → adapter instance
        │     └── .lower(queryAST) → opaque IDBPlanBody
        └── driver-idb/runtime ← createIDBDriver(dbName) → driver instance
              └── .execute(planBody) → runs cursor ops against window.indexedDB
```

---

## Dependency Graph

```
family-idb ──────────────────┐
                              │ (depends on)
target-idb ◄──────────────── adapter-idb
     ▲
     └── family-idb

driver-idb   (no prod deps on target/adapter/family)
```

- `adapter-idb` → `target-idb` (needs target pack identity and codec types)
- `family-idb` → `target-idb` (needs pack metadata to build control descriptors)
- `driver-idb` → nothing in this family (only needs framework-components types)

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
│       │   ├── codecs.ts           ← IDB codec implementations
│       │   ├── idb-adapter.ts      ← lower(queryAST) → IDBPlanBody
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
│       │   └── driver-info.ts      ← version constant
│       ├── idb-driver.ts           ← IDBDriverImpl class
│       └── exports/
│           ├── control.ts    ← ControlDriverDescriptor + create(dbName)
│           └── runtime.ts    ← createIDBDriver() factory + IDBDriverImpl
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
