# Phase 7 — Migration package layer (Group A rewrite)

These working-doc plans implement the architectural feedback from
[`packages/prisma-next/FEEDBACKS.md`](../FEEDBACKS.md). Each phase is a
self-contained chunk of the rewrite; the dependency chain is strict and the
intended landing order is the file order below.

| Phase                                    | Goal                                                                                                          | Depends on |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------- |
| [7.1](PLAN_7.1_foundation.md)            | `IdbMigration` base class, `MigrationCLI` shim, drop manifest layer                                           | —          |
| [7.2](PLAN_7.2_planner_refit.md)         | Planner emits class-based `migration.ts` with `MigrationCLI.run(...)` shim                                    | 7.1        |
| [7.3](PLAN_7.3_runner_refit.md)          | Runner: `executeAcrossSpaces` refuses; drop dry-run; space-keyed marker                                       | 7.1        |
| [7.4](PLAN_7.4_browser_runtime_refit.md) | `createAutoMigratingIdbClient` walks `contractSpace.migrations`; safe policy default; `versionchange` handler | 7.1, 7.3   |
| [7.5](PLAN_7.5_contractspace_codegen.md) | New CLI `prisma-next-idb generate-contract-space` writes the generated wiring module                          | 7.1        |
| [7.6](PLAN_7.6_preflight.md)             | New CLI `prisma-next-idb preflight` walks the chain against `fake-indexeddb`                                  | 7.1, 7.3   |
| [7.7](PLAN_7.7_app_migration.md)         | Migrate `apps/prisma-next-usage` to new design; delete manifest; verify Playwright                            | 7.1–7.5    |
| [7.8](PLAN_7.8_cleanups_closure.md)      | Cross-cutting closure checklist (Group B items absorbed into 7.1–7.7)                                         | All above  |

## Landing strategy

Two PRs (current draft PR keeps the migration coherent, split if review surface gets unwieldy):

- **Stack 1 (foundation, planner, runner, browser)**: 7.1 → 7.2 → 7.3 → 7.4
- **Stack 2 (tooling, app, closure)**: 7.5 → 7.6 → 7.7 → 7.8

Each PLAN\_\*.md has its own acceptance criteria + test plan. None will be
committed verbatim — they are working docs for the implementation pass.

## Coupling notes

- 7.2 and 7.3 both consume types introduced in 7.1 (`IdbMigration`,
  `MigrationCLI`, dropped manifest). They are _independent_ of each other
  but both block 7.4.
- 7.4 is the first phase that touches user-facing browser API
  (`createAutoMigratingIdbClient`).
- 7.5 + 7.6 ship a new CLI binary under `family-idb` (or its own
  package — see 7.5 for the decision point).
- 7.7 is the only phase that actually breaks/fixes the demo app.
- 7.8 is a closure doc — most of its items are folded into the earlier
  phases; it exists to track what got absorbed vs. deferred.

## Vendor reference index

For each phase, the most directly relevant vendor reference:

| Phase | Vendor reference                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 7.1   | `vendor/prisma-next/packages/3-targets/3-targets/postgres/src/core/migrations/postgres-migration.ts` (Migration subclass)            |
| 7.1   | `vendor/prisma-next/packages/1-framework/3-tooling/cli/src/migration-cli.ts` (CLI shim)                                              |
| 7.2   | `vendor/prisma-next/packages/3-targets/3-targets/postgres/src/core/migrations/render-typescript.ts`                                  |
| 7.3   | `vendor/prisma-next/packages/2-sql/9-family/src/core/migrations/runner.ts` (SQL runner shape for executeAcrossSpaces)                |
| 7.4   | `vendor/prisma-next/packages/3-extensions/postgis/src/exports/control.ts` (ContractSpace consumption)                                |
| 7.5   | `vendor/prisma-next/packages/3-extensions/postgis/migrations/refs/head.json` (head ref format)                                       |
| 7.5   | `vendor/prisma-next/packages/1-framework/3-tooling/migration/src/contract-space-from-json.ts` (helper signature)                     |
| 7.6   | `vendor/prisma-next/packages/1-framework/3-tooling/cli/src/commands/migration-check/` (chain validation pattern)                     |
| 7.7   | `vendor/prisma-next/packages/3-extensions/postgis/migrations/20260601T0000_install_postgis_extension/` (full package on-disk layout) |
