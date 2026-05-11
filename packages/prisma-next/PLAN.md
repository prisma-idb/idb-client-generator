## Status

| Phase | Description                                      | Status                        |
| ----- | ------------------------------------------------ | ----------------------------- |
| 1     | Codec system (`target-idb`)                      | ✅ Done                       |
| 2     | Runtime driver (`driver-idb`)                    | ✅ Done                       |
| 3     | Query lowering (`adapter-idb`)                   | ✅ Done                       |
| 4     | Control plane manifest operations (`family-idb`) | ✅ Done — committed `234ebc7` |
| 5     | Migration infrastructure (`target-idb/control`)  | 🚧 In progress                |
| 6     | IDB ORM lane (`client-idb`) + demo app           | ❌ Not started                |
| 7     | Outbox sync                                      | ❌ Not started                |

---

## Phase 5 — Migration infrastructure (target-idb/control)

**Goal:** Make `target-idb` a `MigratableTargetDescriptor`. The target gains a planner that diffs two `IdbSchemaIR`s into an ordered DDL op sequence, and a runner that executes that sequence inside IndexedDB's `upgradeneeded` callback.

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

## Phase 6 — IDB ORM lane + demo app

**Goal:** `idbOrm({ contract, executor })` — a typed per-store client following the Mongo ORM pattern. A demo app (`apps/prisma-next-demo`) exercises the full stack in the browser.

### Mongo ORM pattern (the model to follow)

```ts
// @prisma-next/mongo-orm pattern:
const client = mongoOrm({ contract, executor });
// executor = { execute<Row>(plan): AsyncIterableResult<Row> }
client.User.create({ name: "Alice" });
client.User.where({ id: "u1" }).first();
```

### New package: `packages/prisma-next/client-idb/`

Exports `idbOrm({ contract, executor })` → `IdbOrmClient<TContract>`.

```ts
interface IdbOrmClient<TContract> {
  readonly [StoreName in keyof TContract['storage']['stores']]: IdbStoreAccessor<TContract, StoreName>
}

interface IdbStoreAccessor<TContract, StoreName> {
  create(data: CreateInput<TContract, StoreName>): Promise<Row<TContract, StoreName>>;
  all(): Promise<Row<TContract, StoreName>[]>;
  where(filter: WhereFilter<TContract, StoreName>): IdbStoreQuery<TContract, StoreName>;
  // .first(), .update(), .updateAll(), .deleteCount(), .deleteAll()
}
```

**`IdbQueryExecutor`** (thin interface):

```ts
interface IdbQueryExecutor {
  execute<Row>(plan: IdbQueryPlan<Row>): AsyncIterableResult<Row>;
}
```

The IDB driver (`IDBDriverImpl`) already satisfies this structurally.

### Finishing `adapter-idb/runtime` lower()

MVP operations:

- `findMany` — full cursor scan (TableScanPlan) with in-memory filter
- `create` — IDB `add()` operation

These cover the demo app requirements. Additional operations (update, delete, index lookups) are Phase 6+ extensions.

### Demo app: `apps/prisma-next-demo/`

- SvelteKit + shadcn-svelte (latest)
- Schema: `User { id String @id, name String, posts Post[] }` + `Post { id String @id, title String, authorId String, author User }`
- Vitest integration tests: `client.User.create()` + `client.User.all()` work against `fake-indexeddb`
- Simple UI: create users, list users

---

## Phase 7 — Outbox sync

**Goal:** Bidirectional sync on top of the runtime.

Port the existing sync work from the generator to the new architecture:

- Outbox on the client, changelog materialization on the server
- Ownership DAG validation (the 4 core invariants from todo.md)

---

## Phase 1 — Codec system (target-idb)

**Goal:** `target-idb` contributes a full `CodecLookup` for all 9 IDB scalar types so the runtime stack can serialize/deserialize every field.

**How it works:** The framework reads `types.codecTypes.codecInstances: ReadonlyArray<Codec>` off the descriptor at stack-assembly time and builds a `CodecLookup` internally. There is no `codecs()` method on `RuntimeTargetInstance` — codecs are registered on the descriptor, not the instance.

**Then implement:**

- Create `src/core/codecs.ts` with one `Codec` object per scalar (9 total)
- Each codec needs: `id`, `targetTypes`, `traits`, `encode`, `decode`, `encodeJson`, `decodeJson`
- IDB stores JS values natively, so most are near-identity. Notable exceptions:
  - `DateTime`: store as JS `Date` object natively (IDB supports it); `encode`/`decode` are identity, `encodeJson`/`decodeJson` convert `Date` ↔ ISO string
  - `Decimal`: always string round-trip (precision preservation); all 4 methods operate on strings
  - `Bytes`: `Uint8Array` ↔ `ArrayBuffer` for the wire; `encodeJson`/`decodeJson` use base64
  - `BigInt`: `bigint` ↔ stored as `bigint` (IDB supports it); JSON uses string
- Wire `codecInstances` into `idbTargetDescriptorMeta` under `types.codecTypes`
- This is self-contained, no browser APIs needed, fully unit-testable

## Phase 2 — Runtime plane: driver (driver-idb)

**Goal:** `driver-idb/runtime` can open an actual `IDBDatabase` and execute basic operations.

- `create(dbName, version)` opens `window.indexedDB.open(...)`
- `execute(planBody)` runs a plan body inside an IDB transaction
- Handle `upgradeneeded` for schema setup (needed for Phase 3's integration)
- Test with a real browser environment (Playwright or `fake-indexeddb` for unit tests)

## Phase 3 — Runtime plane: query lowering (adapter-idb)

**Goal:** `adapter-idb/runtime` translates a Prisma query AST into IDB plan bodies the driver can execute.

- Implement `lower(queryAST)` — this is the biggest chunk of logic
- Start with `findMany` (full cursor scan + in-memory filter) — same logic as the existing generator
- Then `create`, `update`, `delete`
- Then `findFirst`, `findUnique` (index-based lookups)
- Relation traversal last

## Phase 4 — Control plane: manifest-based operations (family-idb)

**Goal:** Replace the throwing stubs in `IdbControlFamilyInstance` with real manifest file operations.

- Define the manifest file format (JSON, versioned)
- Implement `introspect` — reads manifest from disk → `IdbSchemaIR`
- Implement `verify` — compares manifest hash against contract's `storageHash`
- Implement `sign` + `readMarker` — writes/reads the marker ledger
- Implement `schemaVerify` — cross-checks live IDB schema against manifest (requires Phase 2's driver)

## Phase 5 — Migration infrastructure (target-idb/control)

**Goal:** `upgradeneeded`-based DDL driven by the manifest diff.

- Define DDL op types: `createObjectStore`, `dropObjectStore`, `createIndex`, `dropIndex`
- Implement `IDBMigrationRunner` — diffs old vs new manifest, generates op sequence, runs inside `upgradeneeded` callback
- Expose `./migration` entrypoint for user-authored migration files
- Wire into `family-idb/control` family instance

## Phase 6 — Integration + usage app

**Goal:** A real end-to-end usage example using all four packages together.

- Update usage (or pidb-kanban-example) to use the new `prisma-next` stack instead of the generator
- A working `contract.ts` → `contract.json` → runtime query flow
- Playwright tests covering the full stack

## Phase 7 — Sync (outbox pattern)

**Goal:** Bidirectional sync on top of the runtime.

- This is your existing sync work from the generator, ported to the new architecture
- Outbox on the client, changelog materialization on the server
- Ownership DAG validation (the 4 core invariants from todo.md)

**Immediate next step** = Phase 1. It's isolated, testable, has no dependencies on browser APIs, and unblocks everything else.
