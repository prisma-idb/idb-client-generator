# Phase 8.4 — `RuntimeCore` query()/execute() split (rc.4)

Stack layer: `feat/prisma-8` → `phase-8.2-content-hash` → `phase-8.3-contract-layer` → `phase-8.4-runtime-core-split`. Depends on 8.1 only (§9's dependency column lists 8.1; sibling to 8.2/8.3, not sequenced by them).

## 0. What was actually broken

`PLAN_8.0` §4 already diagnosed this precisely, so this phase mostly confirms
and implements what §4 predicted rather than discovering something new —
re-measured against the actual baseline before writing any fix, not assumed.

At rc.4, `RuntimeCore<TPlan, TExec, TMiddleware>` (`@prisma/orm-framework/components/runtime`)
is two independent concrete template methods, not one:

- `query<Row>(plan, options?): AsyncIterableResult<Row>` — backed by the
  abstract `runDriver(exec): AsyncIterable<Record<string, unknown>>` hook,
  running the `beforeQuery`/`interceptQuery`/`onRow`/`afterQuery` middleware
  chain.
- `execute(plan, options?): Promise<RuntimeStatementStats>` — backed by a
  **new** abstract `runExecute(exec): Promise<RuntimeStatementStats>` hook,
  running the separate `beforeExecute`/`interceptExecute`/`afterExecute`
  chain, resolving `{ affectedRows }` — no rows.

`runtime-idb/src/idb-runtime.ts`'s `IdbRuntimeImpl` subclassed `RuntimeCore`
and carried a stale `override execute<Row>(...): AsyncIterableResult<Row>`
that called `super.execute(plan, options)` — a hard override-signature
conflict with the base class's now-`Promise<RuntimeStatementStats>` `execute()`.
`runExecute` was never implemented (still abstract). Measured both symptoms
directly, in this order, before writing any fix:

1. `pnpm --filter @prisma-next-idb/runtime-idb exec tsc --noEmit` on the
   untouched baseline: **3 errors, all inside `idb-runtime.ts` itself** —
   `TS2515` (`IdbRuntimeImpl` doesn't implement abstract `runExecute`),
   `TS2416` (the `execute` override's `AsyncIterableResult<Row>` return type
   isn't assignable to the base's `Promise<RuntimeStatementStats>`), and
   `TS2740` (same mismatch, other direction). This confirms `PLAN_8.0` §4's
   own prediction — "a hard TypeScript incompatible-override error, not a
   warning" — exactly as written; no correction to §4 needed here.
2. `pnpm --filter @prisma-next-idb/runtime-idb test` on the same baseline:
   10 of 22 tests failed at runtime with `TypeError: this.runExecute is not
a function`, thrown from inside `runExecuteWithMiddleware` — proof this
   was also a live runtime bug, not just a type-checker complaint, and that
   `pnpm test`'s esbuild-stripped-types path was silently executing the
   broken base-class `execute()` instead of the row-returning path the
   tests assumed.

What §4 predicted correctly but didn't have to spell out (it's a downstream
consequence, not a `runtime-idb`-internal one): fixing the two `tsc` errors
above by deleting the stale override and implementing `runExecute` forces a
_second_, independent change — `IdbRuntime` (our own public interface, not
`RuntimeCore`'s) also declared `execute<Row>(...): AsyncIterableResult<Row>`,
which conflicts with the base class's own now-concrete `execute()` the moment
the stale override is gone (a class can't `implements` an interface requiring
`execute(): AsyncIterableResult<Row>` while inheriting a concrete
`execute(): Promise<RuntimeStatementStats>` from its base). Renaming
`IdbRuntime`'s row-returning method to `query` (matching `RuntimeCore`
exactly, so it's inherited with no override at all) was therefore required,
not optional — and that single rename cascaded into every place `IdbRuntime`
is structurally assigned or its row path is called by name. See §1.

## 1. What this phase actually does

1. **`runtime-idb/src/idb-runtime.ts`**: deleted the stale `execute<Row>()`
   override entirely — `query()` now inherits directly from `RuntimeCore`,
   unmodified, backed by the already-correct `runDriver()`. Added
   `protected override async runExecute(exec): Promise<RuntimeStatementStats>`:
   drains `runDriver(exec)`'s row stream and counts — IDB has no native
   "affected-row count without returning rows" concept, and the driver
   already materializes every op's touched rows in memory before yielding
   (collect-then-yield, see `IdbRuntimeDriverInstance.execute()`), so this
   costs nothing beyond what a `query()` call over the same plan already
   pays. `IdbRuntime` (our own public interface) renamed its row-returning
   member from `execute` to `query`, and gained
   `execute(plan, options?): Promise<RuntimeStatementStats>` matching the
   base class.

2. **`client-idb`'s `IdbQueryExecutor` interface renamed `execute` → `query`.**
   This is `client-idb`'s own decoupling interface (not `RuntimeCore`'s), but
   `IdbRuntime` is assigned directly into `IdbQueryExecutor`-typed slots by
   structural typing at two wiring sites (`idb-client.ts`, `sync-client.ts`)
   — once `IdbRuntime.execute` stopped returning rows, keeping
   `IdbQueryExecutor.execute` around would have required a hand-rolled
   adapter object at every wiring site (and that adapter would need to
   forward `.transaction()`/`.verifyMarker()`/`.close()` too, since
   `requireTransactionExecutor` in `mutation-executor.ts` runtime-checks for
   `.transaction` on whatever's passed as the executor). Renaming to match
   `IdbRuntime.query` keeps every existing `executor: runtime` structural
   assignment working with no wrapper. Cascaded, mechanically, to every
   `.execute(` call site that was really calling `IdbQueryExecutor.execute`
   (confirmed each one individually — see the full inventory this phase's
   implementation was based on, spot-checked file by file rather than blind
   find-replace):
   - `client-idb/src/core/store-accessor.ts` — 2 bound-method locals
     (renamed `executorExecute` → `executorQuery`) + 4 direct
     `this.#executor.execute(plan)` call sites + 1 `.toArray()` call site.
   - `client-idb/src/core/relation-loader.ts` — 2 call sites.
   - `sync-extension-idb/src/core/sync-executor.ts` — `SyncInterceptorExecutor`
     (implements `IdbQueryExecutorWithTransaction`) renamed its own
     `execute<Row>()` method to `query<Row>()`, including its 2 internal
     `this.#inner.execute(...)` delegating calls.
   - 6 test files' mock/stub executor classes (`TestExecutor`,
     `TestExecutorWithTransaction` ×3, `BareTestExecutor`, `SpyExecutor`) —
     each implements `IdbQueryExecutor`/`IdbQueryExecutorWithTransaction` for
     test isolation; renamed their `execute<Row>()` declaration to
     `query<Row>()`. None of their _internal_ `this.#driver.execute(...)`
     calls changed — that's the unrelated driver-level `execute()`
     (`IdbRuntimeDriverInstance.execute()`), never in scope for this rename.

3. **Explicitly NOT renamed — a different `execute()` entirely, confirmed by
   reading its type before touching anything**:
   `IdbTransactionScope.execute(plan: IdbAtomicPlan): Promise<Row[]>`
   (`driver-idb/src/core/transaction-scope.ts`) does not extend or implement
   `RuntimeCore`/`IdbQueryExecutor` at all — it's the driver-level,
   middleware-bypassing transaction surface `withMutationScope()` and
   `mutation-executor.ts`'s ~30 `scope.execute(...)` call sites use, plus
   `sync-extension-idb`'s `outbox-store.ts`/`apply-pull.ts`. Left untouched,
   confirmed via full-repo grep before editing (see the inventory this
   phase's implementation was scoped from) rather than assumed safe.

4. **New test coverage for the actual new behavior** (not just the rename):
   `runtime-idb/test/runtime.test.ts` gained a `describe("execute")` block
   (statement path) with 4 tests — `{ affectedRows: N }` for a draining
   driver, `{ affectedRows: 0 }` for an empty stream, a call-order test
   proving `execute()` fires `beforeExecute`/`afterExecute` and **not**
   `beforeQuery`/`onRow` (the two chains are genuinely separate, not two
   names for the same one), and a test that deliberately **pins a known
   correctness gap** rather than hiding it: a delete-shaped plan resolves
   `{ affectedRows: 0 }` even though a row was deleted, because the real
   driver's `execDelete` (`driver-idb/src/core/execute/ops.ts`) yields no
   rows by design (`store.delete()` has nothing to echo back) and
   `runExecute` counts _rows yielded_, not _ops applied_. See §5 before
   anything starts consuming `execute()`'s count for deletes. The
   pre-existing tests that exercised the
   row-returning path through `.execute(plan)` were renamed to `.query(plan)`
   verbatim; three of them used a `beforeExecute` middleware hook to observe
   call order or capture `contentHash` while calling the row-returning
   path — those hooks were renamed to `beforeQuery` too, since after the
   split `beforeExecute` genuinely never fires on `query()` anymore (it
   would have silently stopped firing and those tests would have started
   passing for the wrong reason — asserting on empty arrays/unset captured
   values — had the hook names been left alone while only the call site was
   renamed).

## 2. Build-staleness trap, hit for real during this phase

Rebuilding `runtime-idb` is necessary before `client-idb`/`sync-extension-idb`
typecheck against the new `IdbRuntime.query()` shape — unsurprising, and
exactly what `PLAN_8.0`'s own "before you start" callout warns about. What's
worth naming explicitly: this phase's validation pass hit the trap a second,
less obvious way. A `git stash` (to prove `cli-tests`'/`sync-server-sql`'s
pre-existing failures were baseline, not a regression — see §3) rebuilt
`runtime-idb` against the **stashed-away, pre-phase** source as a side effect
of validating the baseline, silently leaving a stale (old-shaped) `dist/*.d.mts`
on disk after `git stash pop` restored the phase's actual source changes.
`client-idb`/`sync-extension-idb` briefly re-failed `tsc --noEmit` with
"Property 'query' is missing in type 'IdbRuntime'" — correct symptom, wrong
cause: it looked like the rename hadn't cascaded, but was actually stale
`runtime-idb` dist output. Rebuilding `runtime-idb` again resolved it
immediately. Anyone using `git stash` to check a pre-phase baseline mid-phase
should rebuild every package the stash touched before trusting `tsc` again,
not just the packages they intend to keep changed.

## 3. Out of scope, deliberately

- **Re-emitting any checked-in contract** — unrelated surface, already
  deferred to Phase 8.5 (see `PLAN_8.3_contract_layer.md` §0). This phase
  never touches contract JSON/`.d.ts` files.
- **`scalarTypes`/`scalarTypeDescriptors`** (Phase 8.10) — `adapter-idb`'s
  pre-existing `tsc` error (`descriptor-meta.ts:21`) is untouched by this
  phase and confirmed unrelated (a PSL scalar-authoring break, not a
  `RuntimeCore` one).
- **`cli-tests`/`sync-server-sql` failures** — both fail identically with
  and without this phase's changes (confirmed via `git stash` — see §2):
  `sync-server-sql` still hits `PN-CLI-4009` (dead `prisma-next@0.16.0` CLI,
  Phase 8.1/8.3/8.5 territory), and `cli-tests` fails 23/32 with
  `"prisma-next-idb: failed to load config — Config file not found"` on both
  baseline and phase branches alike — a config-loading issue unrelated to
  the query()/execute() split, in the same dead-CLI/config-unification
  family Phase 8.5/8.6 own. Neither is this phase's to fix.

## 4. Validation

- `pnpm build` — green, repo-wide.
- `runtime-idb` standalone `tsc --noEmit`: clean (was 3 errors, all in
  `idb-runtime.ts` — see §0). `test` (vitest): **26/26 passing** (was 12/22
  passing, 10 failing with `this.runExecute is not a function`, before this
  phase — see §0; includes the new `execute()`-path tests from §1 item 4,
  one of which deliberately pins the known delete-undercount gap — see §1
  item 4 and §5).
- `client-idb` standalone `tsc --noEmit`: clean (after rebuilding
  `runtime-idb` — see §2's build-staleness note). `test`: **219/219 passing**
  (unchanged count from Phase 8.3 — this phase renames call sites, doesn't
  change behavior).
- `sync-extension-idb` standalone `tsc --noEmit`: clean. `test`: **56/56
  passing** (unchanged from Phase 8.3).
- `adapter-idb` standalone `tsc --noEmit`: unchanged, still red on
  `scalarTypeDescriptors` only (Phase 8.10) — confirmed this phase touches
  nothing `adapter-idb` depends on.
- `driver-idb`, `target-idb`, `sync-server` standalone `tsc --noEmit`: clean,
  no new errors.
- `cli-tests`, `sync-server-sql`: fail identically on baseline and on this
  phase's branch (confirmed via `git stash` — see §3). Not a regression.
- `apps/prisma-next-usage` `svelte-check`: clean, 0 errors (this app doesn't
  reference `IdbQueryExecutor`/`IdbRuntime.execute` directly).
- `apps/prisma-next-idb-kanban-example` `svelte-check`: still exactly the 7
  pre-existing `extensions`-field errors from Phase 8.3 (unchanged count and
  message) — confirmed this phase adds none of its own.

No Playwright/e2e run in this phase (deferred to 8.7 per `PLAN_8.0` §8.4).

## 5. Guidance for future sessions

- **`IdbRuntime.execute()` is not yet correct for delete plans — fix this
  before anything starts relying on its count.** `runExecute` counts _rows
  the driver yields_, and a lone `delete`-kind plan yields none by design
  (`execDelete` in `driver-idb/src/core/execute/ops.ts`), so `execute()` on
  a delete resolves `{ affectedRows: 0 }` even though the delete succeeded.
  `add`/`put`/`update` and `scan-write`'s delete branch all count correctly.
  This is dormant today — nothing in this repo calls `IdbRuntime.execute()`
  for real work; `client-idb`'s own `delete()` still drains through
  `query()` (see `store-accessor.ts`). Pinned by a dedicated test in
  `runtime-idb/test/runtime.test.ts` (§1 item 4) so it stays visible. Fix by
  inspecting the plan's `kind` in `runExecute` and counting ops (not rows)
  for delete-shaped atomic plans and for `scan-write`'s delete branch inside
  batch plans.
- **`SyncInterceptorExecutor` (`sync-extension-idb`) only implements
  `query()`, not `execute()`.** It wraps `IdbQueryExecutor` to write outbox
  events and version-meta records alongside tracked mutations, but that
  interception is keyed off `IdbQueryExecutor.query()` specifically (see
  `sync-executor.ts`). A future phase that routes any mutation through
  `IdbRuntime.execute()` instead of `query()` would silently bypass outbox
  tracking for that mutation — `SyncInterceptorExecutor` has no `execute()`
  override to intercept. Not a bug today (nothing calls `.execute()` for
  mutations yet, per the point above), but worth knowing before wiring
  anything new through it.
- Don't reintroduce a unified `execute()` that returns rows — the whole point
  of this phase was un-conflating the two `RuntimeCore` template methods, and
  `IdbQueryExecutor`/`IdbRuntime` now name them `query`/`execute` on purpose,
  matching upstream exactly.
- `IdbTransactionScope.execute()` (driver-idb) is a third, deliberately
  separate `execute()` that bypasses both `RuntimeCore` chains entirely (see
  its own doc comment, updated this phase for clarity) — don't conflate it
  with `IdbQueryExecutor`/`IdbRuntime` if touching it later.
