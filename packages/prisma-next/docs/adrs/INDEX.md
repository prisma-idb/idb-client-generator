# ADR Index — Prisma Next IDB

Architecture decisions for the six-package IDB integration (`packages/prisma-next/`). Each ADR documents a non-obvious decision: what was decided, why, and what was explicitly rejected.

For high-level architecture, see [ARCHITECTURE.md](../../ARCHITECTURE.md). For implementation phases, see [PLAN.md](../../PLAN.md).

---

| #   | Title                                                                                                                                           | Area               | Status                                                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 001 | [IDB Version Integer as Migration Identity](ADR%20001%20-%20IDB%20Version%20Integer%20as%20Migration%20Identity.md)                             | Migrations         | **Superseded by Phase 7** — IDB version is now a runtime-computed trigger (`db.version + 1`). The marker hash is the authoritative position record; the integer carries no semantic information across browsers.                                                                                                         |
| 002 | [Two-Phase Migration: DDL in upgradeneeded, Marker Write Separately](ADR%20002%20-%20Two-Phase%20Migration.md)                                  | Migrations         | Decided — implemented (DDL in `upgradeneeded` via `openAndUpgrade`, marker in subsequent `readwrite` tx via `writeMarker`)                                                                                                                                                                                               |
| 003 | [Plain Frozen Objects for Filter AST](ADR%20003%20-%20Plain%20Frozen%20Objects%20for%20Filter%20AST.md)                                         | Query layer        | Decided — implemented in Phase 6.1 (`IdbFieldFilter`, `IdbAndExpr`, `IdbOrExpr`, `IdbNotExpr`, `IdbNullCheckExpr`)                                                                                                                                                                                                       |
| 004 | [Driver Isolation via IdbRowFilter Closure Boundary](ADR%20004%20-%20Driver%20Isolation%20via%20Row%20Filter%20Closure.md)                      | Package boundaries | Decided — implemented (`IdbRowFilter = (row) => boolean` in driver; client builds closures via `evaluateFilter`)                                                                                                                                                                                                         |
| 005 | [Event-Driven Execution: No async/await Inside IDB Transactions](ADR%20005%20-%20Event-Driven%20Execution%20No%20Async%20Await.md)              | Driver             | Decided — implemented (`execute/ops.ts` is callback-driven throughout)                                                                                                                                                                                                                                                   |
| 006 | [Collect-then-Yield: Full Row Materialization Inside the Transaction](ADR%20006%20-%20Collect%20then%20Yield%20Full%20Row%20Materialization.md) | Driver             | Decided — implemented (`tx.oncomplete → resolve(rows)` in `execute/index.ts`)                                                                                                                                                                                                                                            |
| 007 | [Two Transaction APIs: Automatic Store Inference vs. Manual Scope](ADR%20007%20-%20Two%20Transaction%20APIs.md)                                 | ORM                | Decided — implemented in Phase 6.3 (`IdbBatchPlan` in driver + `withMutationScope`/`IdbTransactionScope` in client-idb)                                                                                                                                                                                                  |
| 008 | [Two Migration Paths: Runtime Auto-Migration and CLI-Managed](ADR%20008%20-%20Two%20Migration%20Paths.md)                                       | Migrations / DX    | **Superseded by Phase 7** — there is now one apply path (browser, via `createAutoMigratingIdbClient` walking the bundled `ContractSpace`). The framework CLI's `db update` / `db verify` / `db init` return `IDB-CLI-UNSUPPORTED` envelopes for IDB.                                                                     |
| 009 | [FK Validation and Referential Action Enforcement](ADR%20009%20-%20FK%20Validation%20and%20Referential%20Action%20Enforcement.md)               | ORM                | Decided — `IdbReferentialAction` + `onDelete?` stored in `IdbModelStorage.relations`; enforced on all scalar writes (FK existence check) and on `delete()` (cascade/setNull/setDefault/restrict/noAction) via `withMutationScope`. Default is `restrict` — silence never permits dangling FKs. Implemented in Phase 6.8. |

---

## Upstream ADRs this work is based on

These vendor ADRs shaped our decisions — read them when the IDB ADRs reference them:

| Upstream ADR                        | What it defines                                   | Where it affects us                                                                          |
| ----------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| ADR 001 — Migrations as Edges       | Hash-based migration graph                        | Phase 7 — we now follow this directly (browser walks `from→to` edges in `contractSpace`)     |
| ADR 005 — Thin Core Fat Targets     | Architecture principle                            | All packages follow this                                                                     |
| ADR 011 — Unified Plan Model        | One immutable Plan across all lanes               | `IdbQueryPlan` shape in `adapter-idb`                                                        |
| ADR 014 — Runtime Hook API          | Plugin hooks (beforeExecute, onRow, afterExecute) | `runtime-idb` + `IdbMiddleware`                                                              |
| ADR 015 — ORM as Optional Extension | ORM layered over runtime, not embedded            | `client-idb` is optional over `runtime-idb`                                                  |
| ADR 016 — Adapter SPI for Lowering  | Lowering interface + capabilities                 | `adapter-idb` descriptor + `lower()`                                                         |
| ADR 021 — Contract Marker Storage   | Marker ownership (runner writes, runtime reads)   | IDB ADR 002, `verifyMarker()`; Phase 7 added space-keyed marker (one row per contract space) |
| ADR 212 — Contract Spaces           | Per-extension migration spaces                    | Phase 7 — IDB now uses `contractSpace.migrations` chain walking; ready for extensions later  |

---

## Post-Phase-7 architectural notes

These complement the per-ADR records and capture decisions made during Phase 7 that don't yet have a dedicated ADR:

- **The CLI has no driver path for IDB.** `executeAcrossSpaces` returns a `IDB-CLI-UNSUPPORTED` envelope; `verify` / `sign` / `readMarker` / `introspect` on the family instance return refusal envelopes or null. The framework SPI still requires a `driver:` value in `prisma-next.config.ts` — use the stub `@prisma-next-idb/driver-idb/control` default export.

- **Authoring → bundling → applying are three separate stages.** Author with `prisma-next migration new` (writes to disk). Bundle with `prisma-next-idb generate-contract-space` (assembles ContractSpace). Apply with `createAutoMigratingIdbClient` (browser). Validation gate is `prisma-next-idb preflight`.

- **`fake-indexeddb` lives in exactly one production code path**: `family-idb/core/preflight.ts`, the standalone preflight command. Everywhere else (runtime, browser, CLI authoring) uses real IndexedDB or trusts the bundled `ops.json` blobs.
