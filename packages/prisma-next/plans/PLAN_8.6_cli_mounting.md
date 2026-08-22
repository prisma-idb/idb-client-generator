# Phase 8.6 — CLI mounting (`@prisma/cli-engine` shell for IDB-specific commands)

Depends on: 8.1, 8.5. Stacked on `phase-8.5-cli-config-unification`.

User decisions going in (asked via `AskUserQuestion` before implementation):

1. **Build the `@prisma/cli-engine` shell** (Option A from `PLAN_8.0` §5), not the
   minimal "keep commander, fix config loading" path.
2. **Bump the version pin to `8.0.0-rc.5`** across every Tier-1 package as part
   of this phase (confirmed new `latest` on all three ORM packages; bugfix-only
   release — aggregate/groupBy pagination fixes we don't hit either way, see
   `PLAN_8.0` §3 item 7).
3. **Split chain regeneration into its own follow-up phase, 8.6.1** — this
   phase is CLI mounting only. Regenerating the 3 deferred packages'
   (`apps/prisma-next-usage`, kanban's IDB side, `sync-extension-idb`)
   migration chains and renaming their configs is migration-content risk,
   deliberately kept out of this PR.

## 0. Findings that reshaped this phase's scope

### 0.1 The generic `prisma` CLI already covers more than `PLAN_8.0` §5 assumed

`PLAN_8.0` §5 was written as if the only path forward was "build an
`idbCommandFamily` from scratch, covering everything." Two things, confirmed
by direct source/package inspection (not re-derived from the changelog),
narrow that:

- **`family-idb` already has a complete, already-ported, already-typechecking
  `ControlFamilyDescriptor`/`ControlFamilyInstance<"idb", IdbSchemaIR>`**
  (`family-idb/src/core/control-descriptor.ts` + `control-instance.ts`,
  exported at `family-idb/src/exports/control.ts`), built in Phase 7 and
  already wired via `family: idbFamily` into every existing
  `prisma-next.config.ts` (apps/prisma-next-usage, kanban's IDB side,
  sync-extension-idb). `pnpm --filter @prisma-next-idb/family-idb check`
  confirms this file typechecks clean against rc.4/rc.5 (family-idb's only
  current typecheck failure is the pre-existing, unrelated Phase 8.10 PSL
  issue). Per ADR 150 ("Family-Agnostic CLI and Pack Entry Points") and the
  `PrismaNextConfig` shape (`@prisma/orm-framework/config/config-types`),
  this means the generic `prisma` CLI's `contract emit`/`db init`/`update`/
  `verify`/`sign` commands work against an IDB-family config **once wrapped
  in the new envelope** — `contract emit` was already confirmed empirically
  in Phase 8.5; the DB-connected commands work too, they just get IDB's
  already-built structured refusal (`IDB-CLI-UNSUPPORTED` — IndexedDB has no
  live database for the CLI to reach, by design, not a gap).
- **This means Phase 8.6 is not "build a whole CLI shell from scratch" — it's
  "expose the 3 commands that have no generic equivalent"**:
  `migration plan` / `migration contract-space` / `migration preflight`
  (today's bespoke `commander`-based `family-idb/src/bin/prisma-next-idb.ts`).
  The real family's `migration new`/`plan`/etc. work against a live DB or a
  SQL/Mongo-specific on-disk model; ours works against `fake-indexeddb` and a
  hand-rolled contract-space/migration-package convention with no generic
  counterpart.

### 0.2 `ormConfigSection` is a real, published export — reuse it, don't mint a new section

Per ADR 150's config-section model, a command family's `needs.config` names a
`ConfigSection<T>` token; `definePrismaConfig`'s docs say "the recognised
section names are exactly the ones the CLI's command families declare."
`PLAN_8.0` §5.3 left open whether we'd need our own `idb` section.

Confirmed by unpacking `@prisma/orm-toolchain@8.0.0-rc.5` from npm and reading
`dist/cli.d.mts`/`dist/cli.mjs` directly: **`ormConfigSection` is a real,
published named export of `@prisma/orm-toolchain/cli`**, alongside
`ormCommandFamily`. Our 3 commands consume `contract.output` and
`migrations.dir` — both live in the **`orm`** section (`PrismaNextConfig`),
not anything IDB-specific. So `idbCommandFamily`'s `configSection` is
literally `ormConfigSection`, reused as-is — one config section serves both
the generic `prisma` CLI's commands and our shell's 3 commands, off the same
`prisma.config.ts`. No new config section, no `idb` key.

### 0.3 `finalizeConfig` is a real, published export too — `resolve-cli-paths.ts` is fully superseded

Read `vendor/prisma/packages/1-framework/3-tooling/cli/src/orm/define-command.ts`
(rc.5, current) as the working reference: every ORM command is defined
through `defineOrmCommand`, a thin wrapper around `defineCommand` whose sole
job is (a) converting a thrown non-`InternalError` into `notOk`, and (b)
calling `finalizeConfig(config, ctx.cwd)` on `ctx.config` before invoking the
handler — because `@prisma/cli-engine`'s own config loader evaluates
`prisma.config.ts` without touching the paths inside it (a mounted command in
the unified host gets `contract.output`/`migrations.dir` exactly as authored,
usually relative).

`finalizeConfig(config: PrismaNextConfig, configDir: string): PrismaNextConfig`
is a real, published export of `@prisma/orm-toolchain/config-loader` (already
imported by our own `family-idb/src/core/resolve-cli-paths.ts`, which already
depends on this exact package). Once our own `defineIdbCommand` wrapper calls
it the same way vendor's does, `resolve-cli-paths.ts`'s bespoke duplicate
config-loading (`loadConfig` + hand-rolled override-merging +
family-mismatch guard) becomes entirely redundant — the engine finds and
validates `prisma.config.ts` itself via `needs: { config: ormConfigSection }`,
our wrapper finalizes the paths, and command handlers just read
`ctx.config.contract?.output` / `ctx.config.migrations?.dir` directly (already
absolute), diffed against CLI flag overrides. **`resolve-cli-paths.ts` is
deleted in this phase.**

### 0.4 The 3 core functions are print-based, not `Presentations`-based — a sink refactor, not a rewrite

`migration-plan.ts`/`preflight.ts`/`contract-space-codegen.ts`'s exported
functions (`migrationPlan`, `runPreflight`, `generateContractSpace`) all
predate this port: they write directly to `process.stdout`/`process.stderr`
(commander convention) and return a bare `Promise<number>` exit code. This
directly conflicts with `@prisma/cli-engine`'s model — a `Handler` must
return `Result<PresentedResult<unknown> | ChildStatusSettlement,
CliStructuredError>`, built via `ctx.present(outcome, presentations)`; there
is no "just write to stdout and return `ok(undefined)`" escape hatch, and
letting these functions write to the real `process.stdout` directly would
(a) corrupt `--json` mode (raw prose mixed into the JSON stream) and (b) be
invisible to `@prisma/cli-engine/testing`'s `createTestCli` harness, whose
in-memory streams these functions never touch.

**Resolution: inject an output sink, don't rewrite the planners.** Each of
the 3 functions gains optional `out`/`err` callbacks (`(line: string) =>
void`, defaulting to `process.stdout.write`/`process.stderr.write` so every
existing call site and every one of the 805 lines of existing unit tests for
these 3 functions keeps passing unchanged), and every internal
`process.stdout.write(x)`/`process.stderr.write(x)` becomes `out(x)`/`err(x)`.
The command handler passes sinks that collect into arrays and builds
`Presentations` from the collected text (`human`/`stdout`: render the
collected lines as a `drawing` block; `json`: `{ exitCode, lines }`). Nothing
reaches the real `process.stdout` inside a mounted run, so `--json` stays
clean and `createTestCli` sees everything. The functions' own logic,
signature return type (`Promise<number>`), and default (unwrapped) behavior
are unchanged.

**Error-path rendering**: since these functions already write specific,
tested error text to `err(...)` before returning nonzero, the command handler
builds the `notOk(...)` `CliStructuredError`'s `summary` FROM the collected
stderr text (not a second, independently-worded message) — one rendering,
not a double one. Verified against `tests/prisma-next-idb-cli`'s substring
assertions (`stderr).toMatch(/chain broken/i)` etc.) — this pattern
still surfaces the original text as the primary error message.

### 0.5 Exit code 2 (`migration plan`'s "name required") collides with the engine's reserved range

`CommandDefinition.exitCodes` documents "codes 4–99" as the space available
for a command's own documented exit codes; 2 and 3 are reserved by the
engine itself (prompt-cannot-be-operated / prompt-cancelled). `migrationPlan`
today returns exit code `2` when `--name` is required but omitted
(incremental mode). This phase **remaps that case to exit code `4`**
(declared via `exitCodes: { 4: "..." }` on the command definition) —
`tests/prisma-next-idb-cli/tests/migration-pipeline.test.ts`'s one assertion
on this (`expect(noName.exitCode).toBe(2)`) is updated to `.toBe(4)`. The
semantic meaning (name required) is unchanged; only the numeric code moves,
to stop colliding with the engine's own reserved range.

### 0.6 rc.5 bump — verified safe for this hop specifically, not safe in general

Bumped `@prisma/orm-framework`/`@prisma/orm-toolchain`/`@prisma/orm-postgres`
from `8.0.0-rc.4` to `8.0.0-rc.5` (exact pin) across every Tier-1
`package.json` (`family-idb`, `target-idb`, `adapter-idb`, `driver-idb`,
`runtime-idb`, `client-idb`, `sync-extension-idb`, `sync-server`,
`sync-server-sql`, `apps/prisma-next-usage`). `@prisma/cli-engine` stays
pinned at exact `0.2.0` — its peer requirement is unchanged between rc.4 and
rc.5 (`vite: "^7.0.0 || ^8.0.0"`, `typescript: ">=5.9"`,
`@prisma/cli-engine: "0.2.0"` — confirmed byte-identical via `npm view
@prisma/orm-toolchain@{8.0.0-rc.4,8.0.0-rc.5} peerDependencies --json`, so
this was not a new peer-dep risk this hop introduced).

**The risk that WAS real and had to be checked, not assumed**: the actually
published `prisma` CLI binary — even at its own newest version, `rc.7` —
bundles `@prisma/orm-toolchain@8.0.0-rc.4` internally (confirmed via `npm
view prisma@{8.0.0-rc.5,rc.6,rc.7} dependencies --json`; no published build
of the unified `prisma` bin bundles `orm-toolchain@rc.5` as of this phase).
`sync-server-sql`'s `contract:emit:postgres`/`db:init` scripts invoke that
real binary. Given Phase 8.5 measured that the storage/profile hashing
algorithm literally moved between the frozen-0.16.0-era build and rc.4, the
same class of skew was a real (not hypothetical) concern between a
library pinned at rc.5 and a CLI binary internally running rc.4 logic
against it.

**Verified empirically, not assumed**: bumped `sync-server-sql`'s
`@prisma/orm-framework`/`@prisma/orm-postgres` to rc.5 anyway, ran its full
suite against a real Postgres (`pnpm --filter
@prisma-next-idb/sync-server-sql test`) — `contract emit`/`db init` via the
real `prisma@rc.7` binary (bundling `orm-toolchain@rc.4`) ran cleanly against
the rc.5-typed config, 23/23 tests passed, and the emitted
`storageHash`/`profileHash` were stable across repeated runs. This closes the
risk **for this specific rc.4→rc.5 hop** (a small, bugfix-only release whose
notes only mention `aggregate()`/`groupBy()` pagination fixes, nothing about
config/contract-emission machinery) — it does **not** establish that a
library/binary version-skew is safe in general. The next person bumping past
rc.5 should re-run this same empirical check (bump, rebuild, run
`sync-server-sql`'s real-Postgres suite, diff the emitted hash), not assume
the skew stays inert because it did this once.

Full build+typecheck+test sweep after the bump: every Tier-1 package builds;
every test suite passes (`target-idb` 84, `adapter-idb` 29, `driver-idb` 59,
`runtime-idb` 27, `client-idb` 219, `sync-extension-idb` 56,
`sync-server` 29, `family-idb` 201, `sync-server-sql` 23 — all green);
`adapter-idb`/`family-idb`'s `pnpm check` failures are the pre-existing,
already-documented Phase 8.10 PSL scalar-authoring issue (present before this
bump too, unrelated to it).

## 1. What this phase builds

A `@prisma/cli-engine`-based shell inside `family-idb`, replacing the
`commander`-based `bin/prisma-next-idb.ts`:

- `src/cli/config-section.ts` — re-exports `ormConfigSection` from
  `@prisma/orm-toolchain/cli` (no new section).
- `src/cli/define-command.ts` — `defineIdbCommand`, mirroring vendor's
  `defineOrmCommand`: wraps `defineCommand`, applies
  `finalizeConfig(ctx.config, ctx.cwd)` before the handler runs, converts a
  thrown non-`InternalError`-shaped error into `notOk`.
- `src/cli/migration/plan.ts`, `contract-space.ts`, `preflight.ts` — the 3
  commands, each collecting the wrapped core function's sink output into
  `Presentations`.
- `src/cli/family.ts` — `idbCommandFamily = defineCommandFamily({
configSection: ormConfigSection, commands: {...}, docsBaseUrl, redirects:
[] })`.
- `src/cli/cli.ts` — `createIdbCli()` / `runIdbCli(proc: HostProcess)`,
  mirroring vendor's `orm/cli.ts` shell-construction pattern (`createCli`,
  `runtimeFromProcess`, `reportStartupFailure`).
- `src/bin/prisma-next-idb.ts` — thin entrypoint: `runIdbCli(process)`
  writes `process.exitCode`. Bin name unchanged (`prisma-next-idb`) — no
  reason surfaced to rename it.
- `src/exports/cli.ts` (new export subpath) — `idbCommandFamily`,
  `createIdbCli`, `runIdbCli` for programmatic/test use.
- `resolve-cli-paths.ts` — **deleted** (see §0.3).
- The 3 core functions (`migration-plan.ts`/`preflight.ts`/
  `contract-space-codegen.ts`) — sink-injected per §0.4, otherwise unchanged.
- `package.json` — drop `commander`; `@prisma/cli-engine` stays a dependency
  (the shell _is_ the binary — no reason to also depend on `prisma` itself).

**Not mounting `ormCommandFamily` alongside ours.** Considered and rejected:
mounting it would duplicate `contract emit`/`db verify`/etc. against the
real `prisma` bin, at a possibly different `orm-toolchain` version than
whatever a user's actual `prisma` install resolves — two copies of the same
surface is worse than one dialect gap. Users get the "one CLI dialect" win
(cli-engine's flag parsing, help tree, JSON output, structured errors) for
the 3 IDB-specific commands; the generic surface stays exactly where it
already lives (the real `prisma` CLI, already proven to work against our
config in Phase 8.5).

## 2. `cli-tests` rewrite

The existing `tests/prisma-next-idb-cli` suite (23/32 failing per Phase
8.5's documented baseline) fails because its fixtures write the **deleted**
flat `prisma-next.config.ts` shape (`export default { family, target,
adapter, contract, migrations }` — no envelope, no `orm` nesting) — this
predates the whole Phase 8 port; rc.4 removed that shape entirely (`PLAN_8.0`
§3 item 5). This was never a regression to fix incidentally — it's the
correct failure mode for fixtures targeting a config shape that no longer
exists, and rewriting them is this phase's actual acceptance gate.

`tests/prisma-next-idb-cli/tests/_helpers.ts`'s `writeMinimalIdbConfig`
rewritten to:

- write `prisma.config.ts` (not `prisma-next.config.ts`) by default,
- wrap the same stub descriptors in
  `definePrismaConfig({ orm: { family, target, adapter, contract,
migrations } })`.

Confirmed the existing stub descriptors themselves don't need to change:
read `@prisma/orm-framework/config/config-validation`'s
`collectConfigIssues` implementation directly (not just its `.d.ts`) — it
requires exactly the same structural shape the fixture's stubs already
produce (`family.kind==="family"`, `id`/`familyId`/`version`/`emission`/
`create`, `target`/`adapter` with matching `familyId`/`targetId`) — this is
the same checker the old `@prisma-next/config`'s `validateConfig` was, moved
packages. Only the file name and the envelope wrapper change.

`_helpers.ts`'s `CLI_BIN` path is unchanged (`dist/bin/prisma-next-idb.mjs`)
— same bin, same build output location, just built from the new shell now.

`migration-pipeline.test.ts`'s one exit-code assertion updated per §0.5
(`toBe(2)` → `toBe(4)`).

## 3. Validation

- `pnpm --filter @prisma-next-idb/family-idb build && pnpm --filter
@prisma-next-idb/target-idb build` before every `cli-tests` run (build-
  staleness trap — `cli-tests` spawns the **built** binary, per `PLAN_8.0`
  §8.4).
- `pnpm --filter @prisma-next-idb/family-idb test` — the 3 core functions'
  805 lines of existing unit tests, unchanged behavior expected (sinks
  default to `process.stdout`/`process.stderr`).
- `pnpm --filter @prisma-next-idb/cli-tests test` — target: 32/32 (up from
  9/32 baseline).
- `pnpm check`/`pnpm lint` across Tier 1 — no new failures beyond the
  pre-existing, already-documented Phase 8.10 PSL issue.

## 4. Handed to Phase 8.6.1 (chain regeneration, split out per the user's decision)

- Regenerate migration chains + rename to `prisma.config.ts` (with the
  envelope) for the 3 deferred packages: `apps/prisma-next-usage`, kanban's
  IDB side, `sync-extension-idb`. Each has a _committed_ chain whose
  `end-contract.json` would go hash-inconsistent on re-emission (Phase 8.5
  §0's "Correction from Phase 8.5" finding) — this needs `migration plan`/
  `contract-space` run against the regenerated contract, using the shell
  this phase just built.
- Re-verify `PLAN_8.0`'s §7 decision 4 (kanban's Postgres side) is still
  correctly out of scope once kanban's IDB side moves — the two sides are
  independent (kanban's `package.json` still pins `@prisma-next/*@^0.16.0`
  for its whole SQL stack).
