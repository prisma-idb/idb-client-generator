# ADR 011 — Combined Single-Transaction Multi-Space Apply

## Status

Decided — implemented. Supersedes the apply-order half of [ADR 010 — Cross-Space Migration Ordering](./ADR%20010%20-%20Cross-Space%20Migration%20Ordering.md); ADR 010's analysis of _why_ the old per-space loop needed app-first ordering remains historically accurate and is kept as context.

## Context

Multi-space `autoMigrate` originally applied each pending contract space (app, then extensions) via its own separate `openAndUpgrade` call — its own IDB version bump, its own `upgradeneeded` transaction, its own marker-write transaction. [ADR 010](./ADR%20010%20-%20Cross-Space%20Migration%20Ordering.md) documented why that design forced app-space to apply first (the marker store is created by the app baseline's own DDL ops, so an extension's marker write would target a non-existent store if it ran first) and flagged two problems as "future work":

1. **No cross-space atomicity.** Upstream [ADR 212 — Contract spaces](https://github.com/prisma/prisma-next/blob/main/docs/architecture%20docs/adrs/ADR%20212%20-%20Contract%20spaces.md) requires multi-space apply to run inside one outer transaction so a failure rolls back every space's writes. The per-space loop instead ran N independent transactions — a crash between space 1 and space 2 left the database genuinely partially migrated (recoverable on next load via [ADR 002](./ADR%20002%20-%20Two-Phase%20Migration.md)'s idempotent-replay guarantee, but not atomic).
2. **N version bumps instead of 1.** On a cold start where both the app space and an extension space need to migrate, the user saw N separate `upgradeneeded`/`blocked` cycles instead of one — worse multi-tab UX (`onblocked` fires once per bump).

## Decision

Collect every pending space's ops into one array and apply them in a **single combined `upgradeneeded` transaction** (one IDB version bump total), followed by a **single batched marker-write transaction** covering every space that migrated.

### What changed

- `target-idb/src/core/apply-ddl-op.ts`: `openAndUpgrade`'s `marker?: MarkerWriteInput` field became `markers?: readonly MarkerWriteInput[]`. A new `writeMarkers(db, inputs)` opens **one** `readwrite` transaction on `_prisma_next_marker` and `put`s every marker inside it (`tx.oncomplete` resolves once, covering all of them). `writeMarker(db, input)` is kept as a thin `writeMarkers(db, [input])` wrapper for the common single-marker case.
- `client-idb/src/core/auto-migrate.ts`: `autoMigrate` still collects `pendingPerSpace` per space (unchanged — this is where the destructive-op refusal check happens, before any database is touched). The apply step now flattens all pending spaces' ops into one array and calls `openAndUpgrade` exactly once, with `targetVersion: initialVersion + 1` and a `markers` array built from every pending space.

### Sequence (combined apply)

```
autoMigrate([{spaceId:'app', ops:[...]}, {spaceId:'idb-sync', ops:[...]}])
  └── openAndUpgrade(targetVersion = v+1, ops = idb-sync.ops ++ app.ops, markers = [idb-sync, app])
        └── upgradeneeded (ONE transaction):
              creates _idb_sync_outbox, _idb_sync_version_meta   (idb-sync's ops)
              creates _prisma_next_marker (first-ever migration), app stores  (app's ops)
        └── onsuccess:
              writeMarkers (ONE transaction): put('idb-sync', ...), put('app', ...)
```

### Op ordering within the combined transaction

Ops are ordered **extensions alphabetical-by-spaceId first, app-space last**, matching upstream ADR 212's stated convention. This is now safe (it was not, under the old per-space-transaction design — that's exactly what ADR 010 explains) because marker writes happen in the separate phase-2 transaction, which only runs after **all** phase-1 DDL — including the app space's `_prisma_next_marker`-creation op — has already committed. Relative op order inside phase 1 has no effect on marker-write safety anymore; IDB object stores have no forward schema references at DDL time regardless (unlike Postgres, where extension-installed native types must exist before app tables can reference them).

## Why this is safe to combine

- **DDL scope.** A `versionchange` transaction already spans every object store in the database — concatenating ops from disjoint spaces into one transaction is not new IndexedDB territory, just fewer round trips through `IDBFactory.open`.
- **Store disjointness.** Every extension space uses a distinct store-name prefix by convention (the sync extension: `_idb_sync_*`); app-space and extension-space ops never target the same store, so op order across spaces cannot produce a `ConstraintError` collision.
- **Existing idempotency guarantees are untouched.** `applyOneDdlOp`'s existence-check guards ([ADR 002](./ADR%20002%20-%20Two-Phase%20Migration.md)) still make a replayed DDL op a no-op; a crash during phase 1 still rolls back the whole (now-larger) transaction and phase 1 replays cleanly from scratch on the next `autoMigrate` run.
- **Marker-write batching reuses the exact two-phase split** ADR 002 established — this ADR only changes _how many_ markers land in phase 2's transaction (N in one, instead of N separate ones), not the phase 1/phase 2 boundary itself.

## What we deliberately did not do

**Write markers inside the same `upgradeneeded` transaction as the DDL.** ADR 002 already rejected mixing DDL and marker writes in one callback for separation-of-concerns reasons; that reasoning is unchanged by combining spaces, so the two-phase split stays intact — phase 2 just now writes N records instead of 1.

**Keep per-space transactions but reorder them to match ADR 212.** This would still leave the atomicity gap (problem 1) unaddressed and would still need _some_ ordering rule between transactions (even a "safe" one), where the combined-transaction design needs none.

## Consequences

- Multi-space apply is now atomic: either every pending space's DDL and marker both land, or (on any failure) none of phase 1 commits and nothing in phase 2 runs. The database never ends up with, e.g., the app space migrated and the sync extension not, mid-transaction. (A crash _between_ phase 1 committing and phase 2 completing is still possible and still safe-but-not-atomic — this is the same recoverable window ADR 002 already describes, now covering all spaces at once instead of one.)
- Cold-start multi-space apply triggers exactly one `upgradeneeded`/`blocked` cycle regardless of how many spaces have pending work.
- `openAndUpgrade`'s public signature changed (`marker` → `markers`). The only production caller (`auto-migrate.ts`) was updated in the same change; no other package called the old `marker` field.
- Extension authors no longer need to reason about declaration order relative to the app space at all — not because it's harmless (per ADR 010, it wasn't, under the old design) but because the new design removed the mechanism that made it matter.

## Related

- [ADR 002](./ADR%20002%20-%20Two-Phase%20Migration.md) — the DDL/marker-write phase split this design batches within, unchanged in spirit.
- [ADR 010](./ADR%20010%20-%20Cross-Space%20Migration%20Ordering.md) — the problem this ADR resolves; kept as the historical record of why app-first ordering was necessary under the superseded per-space-transaction design.
- Upstream [ADR 212 — Contract spaces](https://github.com/prisma/prisma-next/blob/main/docs/architecture%20docs/adrs/ADR%20212%20-%20Contract%20spaces.md) — `executeAcrossSpaces`' single-outer-transaction requirement for the SQL family, which this ADR now matches in spirit for IDB.
- `target-idb/src/core/apply-ddl-op.ts` — `openAndUpgrade`/`writeMarkers` implementation.
- `client-idb/src/core/auto-migrate.ts` — `autoMigrate` implementation.
