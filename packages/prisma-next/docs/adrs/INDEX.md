# ADR Index — Prisma Next IDB

Architecture decisions for the six-package IDB integration (`packages/prisma-next/`). Each ADR documents a non-obvious decision: what was decided, why, and what was explicitly rejected.

For high-level architecture, see [ARCHITECTURE.md](../../ARCHITECTURE.md). For implementation phases, see [PLAN.md](../../PLAN.md).

---

| #   | Title                                                                                                                                           | Area               | Status                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ----------------------------- |
| 001 | [IDB Version Integer as Migration Identity](ADR%20001%20-%20IDB%20Version%20Integer%20as%20Migration%20Identity.md)                             | Migrations         | Decided                       |
| 002 | [Two-Phase Migration: DDL in upgradeneeded, Marker Write Separately](ADR%20002%20-%20Two-Phase%20Migration.md)                                  | Migrations         | Decided                       |
| 003 | [Plain Frozen Objects for Filter AST](ADR%20003%20-%20Plain%20Frozen%20Objects%20for%20Filter%20AST.md)                                         | Query layer        | Decided                       |
| 004 | [Driver Isolation via IdbRowFilter Closure Boundary](ADR%20004%20-%20Driver%20Isolation%20via%20Row%20Filter%20Closure.md)                      | Package boundaries | Decided                       |
| 005 | [Event-Driven Execution: No async/await Inside IDB Transactions](ADR%20005%20-%20Event-Driven%20Execution%20No%20Async%20Await.md)              | Driver             | Decided                       |
| 006 | [Collect-then-Yield: Full Row Materialization Inside the Transaction](ADR%20006%20-%20Collect%20then%20Yield%20Full%20Row%20Materialization.md) | Driver             | Decided                       |
| 007 | [Two Transaction APIs: Automatic Store Inference vs. Manual Scope](ADR%20007%20-%20Two%20Transaction%20APIs.md)                                 | ORM / Phase 6.3    | Decided — not yet implemented |

---

## Upstream ADRs this work is based on

These vendor ADRs shaped our decisions — read them when the IDB ADRs reference them:

| Upstream ADR                        | What it defines                                   | Where it affects us                         |
| ----------------------------------- | ------------------------------------------------- | ------------------------------------------- |
| ADR 001 — Migrations as Edges       | Hash-based migration graph                        | IDB ADR 001 (we adapted the model)          |
| ADR 005 — Thin Core Fat Targets     | Architecture principle                            | All packages follow this                    |
| ADR 011 — Unified Plan Model        | One immutable Plan across all lanes               | `IdbQueryPlan` shape in `adapter-idb`       |
| ADR 014 — Runtime Hook API          | Plugin hooks (beforeExecute, onRow, afterExecute) | `runtime-idb` + `IdbMiddleware`             |
| ADR 015 — ORM as Optional Extension | ORM layered over runtime, not embedded            | `client-idb` is optional over `runtime-idb` |
| ADR 016 — Adapter SPI for Lowering  | Lowering interface + capabilities                 | `adapter-idb` descriptor + `lower()`        |
| ADR 021 — Contract Marker Storage   | Marker ownership (runner writes, runtime reads)   | IDB ADR 002, `verifyMarker()`               |
