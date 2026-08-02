# ADR 010 — Cross-Space Migration Ordering: App-Space Always First

## Status

**Superseded by [ADR 011 — Combined Single-Transaction Multi-Space Apply](./ADR%20011%20-%20Combined%20Single-Transaction%20Multi-Space%20Apply.md).** The per-space-transaction design this ADR analyzes (and the app-first ordering it required) has been replaced by a combined single-transaction apply. Kept as the historical record of _why_ app-first ordering was necessary under that design — the reasoning about the marker-store bootstrap dependency is still accurate background for ADR 011.

## Context

Phase 7 added multi-space migration support (`createAutoMigratingIdbClient({ extensions: [...] })`) so IDB extensions like the sync extension can own their own contract space, disjoint from the application's. Upstream [ADR 212 — Contract spaces](https://github.com/prisma/prisma-next/blob/main/docs/architecture%20docs/adrs/ADR%20212%20-%20Contract%20spaces.md) is the framework's general model for this, and it states a specific cross-space ordering convention for the SQL family:

> Cross-space ordering: extension spaces alphabetical-by-spaceId first, app-space last. [...] matches the implicit dependency direction — application schema may reference extension-provided types (`Encrypted<String>` → `eql_v2_encrypted`), so extension types must exist before the app's `CREATE TABLE` runs.

`autoMigrate` (`client-idb/src/core/auto-migrate.ts`) does the opposite: it always applies the **app space first**, then extensions in declaration order (`auto-migrate.ts:172-175`). This is not an oversight — the SQL convention cannot be ported to IDB as-is, for a reason specific to how IDB bootstraps its marker store.

## Decision

The app space is always applied first. Extension spaces follow, in the order they're passed to `extensions`.

## Why the upstream convention doesn't transfer

In Postgres, marker-table creation is a **framework-internal bootstrap step** (`ensureControlTables`, upstream [ADR 021](https://github.com/prisma/prisma-next/blob/main/docs/architecture%20docs/adrs/ADR%20021%20-%20Contract%20Marker%20Storage.md), "applied before any user / extension migrations on framework boot"). It's decoupled from both app-space and extension-space migrations, so there's no ordering hazard — by the time any space's migration runs, `prisma_contract.marker` already exists. Extension-first ordering is then free to follow the actual schema dependency direction (app tables may reference extension-installed types).

IDB has no equivalent bootstrap phase. `_prisma_next_marker` is created as one of the **app baseline's own DDL ops** — the generic `IdbMigrationPlanner` prepends a `createObjectStore("_prisma_next_marker", ...)` op whenever it plans from `fromContract: null` (see `family-idb/src/core/generate-baseline.ts:122-124`). It is not a separate framework-owned step; it's bundled into whatever migration happens to be the very first one applied to a fresh database.

Combined with today's per-space apply loop — each space with pending ops gets its own `openAndUpgrade` call, its own version bump, its own `upgradeneeded` transaction (`auto-migrate.ts:218-228`) — this creates a hard ordering constraint: if an extension's `openAndUpgrade` ran before the app space's, its marker write (`writeMarker(db, { space: 'idb-sync', ... })`) would target a `_prisma_next_marker` store that doesn't exist yet.

Separately: IDB object stores don't have forward schema references at DDL time the way Postgres columns do (`createObjectStore` never needs another store to already exist), so the _semantic_ rationale behind ADR 212's extension-first convention — "app schema may reference extension types" — doesn't actually apply to IDB regardless of the marker-store issue. The only reason ordering matters here is the marker-store bootstrap dependency described above.

### Sequence (current, per-space apply)

```
autoMigrate([{spaceId:'app',...}, {spaceId:'idb-sync',...}])
  └── space 'app':    openAndUpgrade(targetVersion = v+1)
        └── upgradeneeded: creates _prisma_next_marker (first-ever migration) + app stores
        └── onsuccess:     writeMarker({space:'app', ...})       ← _prisma_next_marker now exists
  └── space 'idb-sync': openAndUpgrade(targetVersion = v+2)
        └── upgradeneeded: creates _idb_sync_outbox, _idb_sync_version_meta
        └── onsuccess:     writeMarker({space:'idb-sync', ...})  ← safe, store already exists
```

If the order were flipped, the second bullet's `writeMarker` call for `'idb-sync'` would run against a database where `_prisma_next_marker` has never been created — either a silent no-op (see the `console.warn` guard in `apply-ddl-op.ts:101-109`) or a lost marker write, either way leaving the extension space unable to record that it migrated.

## What we deliberately did not do

**Match ADR 212's extension-first convention as written.** Doing so would require either (a) making `_prisma_next_marker` creation a true framework-level bootstrap step decoupled from the app baseline's own ops (mirroring `ensureControlTables`), or (b) collecting every space's ops into a single combined `upgradeneeded` transaction so ordering within it stops being a marker-availability hazard. Both are real options — see "Future work" below — but neither is in place today, so app-first is the only ordering that's currently safe.

## Future work: combined single-transaction apply

A follow-up design would collect **all** pending spaces' ops into one array, bump the IDB version exactly once, and apply everything (app + every extension) inside a single `upgradeneeded` transaction, followed by a single batched marker-write transaction covering every space that migrated. This is analyzed in depth as part of atomicity considerations (see the sync-extension-idb PR discussion); in short:

- It would restore true cross-space atomicity (today's N-separate-`openAndUpgrade` loop means a crash between space 1 and space 2 leaves the database partially migrated — recoverable on next load via the existing idempotent-replay guarantee from [ADR 002](./ADR%20002%20-%20Two-Phase%20Migration.md), but not atomic).
- It would also **remove this ADR's ordering constraint entirely**: since marker writes would happen in a phase strictly after all DDL (including `_prisma_next_marker` creation) commits, the relative order of spaces' DDL ops within the combined transaction would no longer matter for marker-write safety, and cross-space ordering could freely match ADR 212's convention if desired.
- Cost: a moderate, contained refactor — `openAndUpgrade`/`writeMarker` (`target-idb/src/core/apply-ddl-op.ts`) would need to accept a marker _array_ instead of a single marker, and `autoMigrate`'s per-space loop would collapse into one concatenated-ops call. Existing tests in `target-idb` and `client-idb` that assume one marker per `openAndUpgrade` call would need updating.

Not implemented as part of this ADR; recorded here so the ordering decision above is understood as provisional, not permanent.

## Consequences

- `autoMigrate`'s `spaces` array is always constructed app-first (`auto-migrate.ts:172-175`); this must not be changed to match upstream's extension-first convention without first addressing the marker-store bootstrap dependency described above.
- Extension authors do not need to worry about declaration order relative to the app space — only the relative order of `extensions` entries to each other is under their control, and nothing today depends on that ordering either (each extension space's stores are disjoint).
- A crash between two spaces' `openAndUpgrade` calls is safe but not atomic (see "Future work"): the next `autoMigrate` run re-derives pending work from actual marker state and finishes the remaining space.

## Related

- [ADR 001](./ADR%20001%20-%20IDB%20Version%20Integer%20as%20Migration%20Identity.md) — IDB version integer as the DDL trigger mechanism this ordering builds on.
- [ADR 002](./ADR%20002%20-%20Two-Phase%20Migration.md) — the DDL/marker-write phase split and its crash-recovery guarantee, which is what makes non-atomic multi-space apply safe-if-not-atomic.
- Upstream [ADR 212 — Contract spaces](https://github.com/prisma/prisma-next/blob/main/docs/architecture%20docs/adrs/ADR%20212%20-%20Contract%20spaces.md) — the general contract-space model; source of the extension-first convention this ADR deviates from.
- Upstream [ADR 021 — Contract Marker Storage](https://github.com/prisma/prisma-next/blob/main/docs/architecture%20docs/adrs/ADR%20021%20-%20Contract%20Marker%20Storage.md) — `ensureControlTables` as the SQL family's decoupled bootstrap step; IDB has no equivalent.
- `client-idb/src/core/auto-migrate.ts` — implementation.
- `target-idb/src/core/apply-ddl-op.ts` — `openAndUpgrade`/`writeMarker`, referenced in "Future work."
