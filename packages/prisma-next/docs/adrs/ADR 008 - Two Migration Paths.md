# ADR 008 — Two Migration Paths: Runtime Auto-Migration and CLI-Managed

## Context

IndexedDB is a browser-local database. Unlike server-side databases (Postgres, SQLite, MongoDB), there is no deploy step where a CLI can connect to a live database and apply migrations before the application serves traffic. The browser opens the database when the user visits the page — there is no "before" moment.

However, teams building production applications want:

- **Reviewable migration history** — git-tracked migration files that show what DDL changed and why.
- **CI verification** — `prisma-next db verify` in CI to catch schema drift before it reaches users.
- **Explicit control** — the ability to author data-transform migrations (backfills, type casts) that can't be derived from a pure schema diff.

These two forces — browser-local always-on vs. team-level control — pull in opposite directions.

## Decision

We provide **two migration paths** that share the same planner and runner:

### Path A — Runtime auto-migration (the default)

```ts
// One function call, zero config
const db = await createAutoMigratingIdbClient({ contract, dbName: "my-app" });
```

Under the hood:

1. Reads the `_prisma_next_marker` store from the live IDB database
2. If the marker's `storageHash` doesn't match the contract → diffs the schema, plans DDL ops, opens IDB at the next integer version, applies them in `upgradeneeded`, writes the new marker
3. If the marker matches → instant open, no overhead

This is the **only** path needed for local dev, prototypes, and SPAs without a server.

### Path B — CLI-managed migrations (opt-in)

```bash
prisma-next db sign        # write contract marker to manifest
prisma-next db verify      # check marker matches contract
prisma-next migration new  # scaffold a migration.ts
prisma-next db update      # plan + apply, bump idbVersion in manifest
```

Requires a `prisma.config.ts` that wires the family, target, adapter, and driver descriptors. The CLI reads/writes `prisma-idb.manifest.json` — the on-disk record of the last-applied `idbVersion` and contract marker.

When using Path B, the runtime can pass the manifest through so it respects the CLI-managed `idbVersion`:

```ts
import manifest from "../prisma-idb.manifest.json" with { type: "json" };
const db = await createAutoMigratingIdbClient({ contract, dbName: "my-app", manifest });
```

### Shared infrastructure

Both paths use the **same** types, planner, runner, and marker store:

```
┌─────────────────────────────────────────────────────┐
│                  IdbMigrationPlanner                │
│                  IdbMigrationRunner                 │
│              _prisma_next_marker store              │
├───────────────────────┬─────────────────────────────┤
│      Path A           │         Path B              │
│  (runtime, browser)   │    (CLI, design-time)       │
│                       │                             │
│  createAutoMigrating  │  prisma-next db update      │
│    IdbClient()        │  prisma-next migration new  │
│                       │  prisma.config.ts           │
│  No config needed     │  prisma-idb.manifest.json   │
└───────────────────────┴─────────────────────────────┘
```

The manifest's `idbVersion` field is the bridge: the CLI bumps it when applying migrations, and the runtime reads it (when provided) to compute the correct `targetVersion` for `IDBFactory.open()`. When the manifest is not provided, the runtime probes the live database to discover the current version.

### `dbName` is the space boundary (not `spaceId`)

The vendor framework (Postgres, Mongo) uses `spaceId` to partition a **single database connection** into logical slices — one per extension pack — sharing the same underlying connection. This works because SQL databases have schemas and Mongo has collections inside a single cluster handle.

IndexedDB has no such nesting. Its only namespace primitive is the **database name** passed to `indexedDB.open(name, version)`. Every object store is flat at the top level inside that database. You cannot create "schemas inside a database" — the database name **is** the space.

**Therefore, `dbName` — not `spaceId` — is the natural isolation boundary for IDB:**

```
indexedDB.open("my-app")          → users, posts, _prisma_next_marker
indexedDB.open("my-app-tenant-b") → users, posts, _prisma_next_marker
```

Each database name gets its own:

- Version counter (IDB enforces monotonic per-name)
- Object stores and indexes
- `_prisma_next_marker` store
- Manifest `idbVersion` (one per database, tracked via `prisma-idb.manifest.json`)

This means **multi-tenancy in IDB is achieved by varying `dbName`**, not by introducing a nested `spaceId` concept. For single-database use, we hardcode `spaceId = "app"` to satisfy the vendor's `MigrationPlanner.plan()` interface — it costs nothing and the parameter is ignored by the IDB planner.

We deliberately chose **not** to map `spaceId` to `dbName` because:

| If we did this...              | Problem                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `spaceId = dbName` everywhere  | Conflates the vendor's "extension slice" concept with IDB's "database" concept. When IDB extensions arrive (future), they'd need true `spaceId` partitioning within a single database to share transactions. |
| `spaceId = some tenant prefix` | The manifest tracks one `idbVersion` per file; per-tenant manifests would need per-tenant files. That's correct (each database has its own version), but it muddies the CLI's single-manifest model.         |

Keeping `spaceId = "app"` and using `dbName` as the user-facing multi-tenancy primitive keeps both concepts clean and future-proof.

### Which path when?

| Concern                              | Path A (runtime) | Path B (CLI) |
| ------------------------------------ | :--------------: | :----------: |
| Local dev / prototype                |        ✅        |      —       |
| SPA with no server                   |        ✅        |      —       |
| Git-tracked migration history        |        —         |      ✅      |
| CI verification (`db verify`)        |        —         |      ✅      |
| Data-transform migrations (backfill) |        —         |      ✅      |
| Team review of DDL changes           |        —         |      ✅      |

## What we deliberately did not do

**Make the CLI mandatory.** This would break the zero-config SPA use case — the whole point of IDB is that it works without a server. Path A is the default; Path B is an opt-in upgrade for teams.

**Make runtime auto-migration the only path.** This would make it impossible to author data-transform migrations, review DDL changes in PRs, or verify schema integrity in CI. Teams building production apps need these capabilities.

**Have separate planner/runner for each path.** This would create a correctness fork — a migration that works in the CLI but fails at runtime (or vice versa). By sharing the same planner and runner, both paths produce identical DDL for the same contract diff.

**Auto-detect which path is active.** We considered having the runtime detect whether a `prisma.config.ts` exists and switch behavior automatically. We rejected this because it would make the runtime's behavior path-dependent on filesystem state, which is hard to test and reason about. The explicit `manifest` parameter is a cleaner contract.

**Generate migration files from the runtime.** The runtime could theoretically write `migration.ts` files back to disk after auto-migrating. We rejected this because the browser has no filesystem access — and even with the File System Access API, writing back to the developer's source tree from a production page is the wrong direction.

## Consequences

- The `client-idb` package exports two entry points: `client` (no migration) and `client-auto` (auto-migration). Users pick based on whether they want Path A or just the raw ORM.
- `createAutoMigratingIdbClient` is async (migration may run) while `createIdbClient` is synchronous (no migration).
- The `prisma-idb.manifest.json` file is the on-disk bridge between paths. Losing it means the CLI loses track of `idbVersion` — the runtime can still auto-migrate, but the CLI must re-sign.
- The manifest is only written by the CLI. The browser runtime never writes it (no filesystem access). This means `idbVersion` in the manifest can lag behind the actual IDB version if the runtime auto-migrates without a manifest. The `storageHash` comparison is always the authoritative check (ADR 001).

## Related

- [ADR 001](ADR%20001%20-%20IDB%20Version%20Integer%20as%20Migration%20Identity.md) — `idbVersion` as the integer migration identity
- [ADR 002](ADR%20002%20-%20Two-Phase%20Migration.md) — why DDL and marker write are separate phases
- Upstream ADR 001 — Migrations as Edges (the hash-edge model we adapted from)
- `client-idb/src/core/auto-migrate.ts` — Path A implementation
- `target-idb/src/core/migration-planner.ts` — shared planner
- `target-idb/src/core/migration-runner.ts` — shared runner
- `target-idb/src/exports/control.ts` — CLI target descriptor with `migrations` capability
