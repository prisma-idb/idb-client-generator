# ADR 014 — Sync Ownership DAG

## Context

The outbox pattern (`sync-executor.ts`) makes local writes durable and retryable, but it says nothing about whether a given write is one the _pusher is allowed to make_. A malicious or buggy client can put anything in its outbox — `{ model: "Comment", operation: "update", payload: { id: "someone-elses-comment", body: "..." } }` — and without a check, the push endpoint will happily materialize it into the shared changelog. Symmetrically, pull has to answer "which rows does this client get to see," not just "which rows exist."

The old generator solved both with a single mechanism: a `rootModel` (e.g. `User`) designated in generator config, an ownership DAG built from every model's relations back to that root (`createDAG.ts`), and, for any non-root model, _every_ structural path back to root (`buildAllAuthorizationPaths`, not just the shortest — a model can be reachable through more than one relation chain, and any valid chain should authorize it). Push validates a record's chain resolves to the pusher's `scopeKey`; pull's `findFirst`/`findUnique` queries are built directly from the same paths (`create.ts:290-343`).

Two things from the Will Madden conversation and the framework docs bear on where this lives:

- **`model.owner` is not this.** ADR 177 (upstream) defines `owner` as aggregate membership — "this model's data is physically co-located with its owner's storage" (embedded doc, JSONB column). It's a storage-locality fact, computed once, structural. The sync `rootModel` DAG is an _authorization_ fact — "this row is only visible to/writable by whoever owns the root record it chains back to" — evaluated per-request against a caller's identity, not structural. Reusing `owner` for both would silently conflate "lives inside" with "is gated by," which are different questions with different answers for plenty of real schemas (e.g. a `Comment` might not be storage-owned by `Post` in Mongo's embedding sense at all, while still needing to be _authorization_-scoped to the `Post`'s author).
- **This is server-side, full stop.** Nothing about push validation or pull scoping runs in the browser — the client doesn't decide what it's allowed to see or write, the server does. This matters for where the DAG code lives (never shipped to `sync-extension-idb`, which is browser-bundled) and confirms the "ship a sync-server package" decision isn't just packaging preference — it's the only place this logic is _allowed_ to run.

## Decision

### A new `@prisma-next-idb/sync-server` package, transport-agnostic

Not coupled to Prisma Client, not coupled to any HTTP framework. It takes a contract (the _server_-side one from ADR 012 — the DAG needs the full model graph, including anything excluded from the client) and a `rootModel` name, and exposes:

```ts
const syncServer = createSyncServer({ contract, rootModel: "User" });

// Push: validate + return per-event results, caller executes the writes
const results = syncServer.validatePush(events, { scopeKey });

// Pull: build the scoped WHERE-shape for each changelog row, caller executes the reads
const scopedQueries = syncServer.buildPullQueries(logs, { scopeKey });
```

`validatePush`/`buildPullQueries` return _descriptions_ of what to check/query, not query results — the actual DB access (Prisma Client, raw SQL, whatever the server uses) stays the caller's responsibility. This is the "transport-agnostic" boundary: `sync-server` knows the shape of authorization, not how to talk to Postgres.

### The DAG is built at runtime, from the contract, every server start

No generated file. `buildOwnershipDag(contract, rootModel)` walks `contract.domain.models[*].relations` once at `createSyncServer()` time — the same "derive from contract.domain, no executable codegen" pattern `decodeJsonRecord` (`target-idb/src/core/decode-json-record.ts`) already established for wire decoding. Construction re-derives `createDAG.ts`'s two invariant checks against the new relation shape:

- **Root reachability** — every model must have a path of required relations back to `rootModel` (BFS over the reverse graph, `createDAG.ts:27-61`'s algorithm, walking `model.relations` instead of DMMF object fields).
- **Acyclicity** — the ownership graph itself (required N:1 edges) must not cycle (`createDAG.ts:63-89`'s algorithm, same graph shape).

Both checks throw at `createSyncServer()` construction, not per-request — a broken DAG is a deploy-time configuration error, not a runtime one, matching the old generator's fail-fast-at-codegen posture just moved to fail-fast-at-boot (since there's no codegen step left to fail at).

### Push validation

For each outbox event: resolve every authorization path from `event.model` to `rootModel` (all paths, not just shortest — same reasoning as the old generator, a model can legitimately chain to root through more than one relation). Build the flat WHERE-shape combining the record's own key with _any one_ path resolving to `scopeKey`. The caller executes it (`findFirst`); a miss means `SCOPE_VIOLATION`. Record-shape validation (does the payload match the contract) is ADR 015's job, run first — a malformed payload never reaches DAG resolution.

### Pull scoping

Symmetric: for the root model, the row's own key must equal `scopeKey` directly (no chain needed, it _is_ the root). For every other model, `buildPullQueries` emits the same multi-path WHERE-shape push validation uses, so a client can never pull a row it couldn't have legitimately pushed.

## Why not fold this into `sync-extension-idb`

`sync-extension-idb` is client-side and browser-bundled. Ownership/ authorization logic in a browser bundle is dead weight at best (it's re-derivable from the contract the browser already has, so it teaches an attacker nothing they didn't already know) and a false sense of security at worst if anyone mistakes client-side filtering for enforcement. The framework's own migration-planner-in-the-browser mistake (`FEEDBACK.md` items 1-2) is the cautionary precedent: anything that's a server-authoritative decision shouldn't ship to every client just because the client _could_ compute it.

## Why "any one path," not "shortest path" or "all paths must hold"

A record legitimately reachable through relation A _or_ relation B should be authorized either way — requiring _all_ paths to resolve would incorrectly reject valid ownership through a secondary relation, and picking only the shortest would incorrectly reject valid ownership when the shortest path happens to be broken (e.g. a nullable FK on that particular row) while a longer path is intact. This is exactly the old generator's reasoning (`buildAllAuthorizationPaths` returns every path, sorted only for _query construction_ preference, not correctness).

## Consequences

- **`rootModel` becomes a required, validated config field** for any app using sync, exactly as in the old generator (`outboxSync && !rootModelString` throws at config time). It must survive ADR 012/013's projection on _both_ sides — the client contract needs the root model to exist too (the local outbox events need to be attributable), even though the DAG computation itself only runs server-side.
- **Multi-hop authorization paths mean push validation is O(paths × path length) reads per event**, not O(1). The old generator accepted this (a `findFirst` per event, in the worst case per path); we inherit the same cost profile until/unless there's a reason to optimize it.
- **No client-side authorization enforcement exists or is intended.** This ADR doesn't add anything to `sync-extension-idb`. A client can still construct an outbox event for data it doesn't own — it just won't push successfully. This is by design, not a gap: client-side state is inherently untrusted.
- **Doesn't reuse `model.owner`.** A schema author declaring both an `owner` (storage aggregate) and a `rootModel`-reaching relation chain (authorization) on the same model is normal and expected — they answer different questions and can point at different models entirely.

## Implementation notes

`createSyncServer` ended up taking **two** contracts, not the one the Decision section's sketch shows:

```ts
const syncServer = createSyncServer({
  contract, // full server contract (ADR 012) — used for graph edges
  clientContract, // client-projected contract (ADR 012) — defines what's ever synced
  rootModel: "User",
});
```

The reason is the root-reachability check's scope. "Every model must have a path back to `rootModel`" can't mean _every model in the full contract_ — a server-only model with no relations at all (this repo's own kanban-example `AuditLog`) would fail construction for no reason: it's `@@idb.exclude`'d, so it can never appear in an outbox event or a pull-scope check, and there's nothing to authorize. But it also can't mean _every model with at least one relation_, silently exempting anything relation-less — that would let a schema author forget `@@idb.exclude` on a genuinely-synced island model and never find out until a push for it mysteriously has no valid authorization path at runtime, instead of at boot.

The resolution: reachability is required for every model in `clientContract` (i.e. everything that survives ADR 012's projection) and only those — matching the old generator's behavior where `filteredModels` was, by construction, exactly the synced set. Server-only models stay in the graph as possible waypoints (a client model's chain may legitimately pass through one) but are exempt from having to reach root themselves. Forgetting `@@idb.exclude` on an island model still throws at `createSyncServer()` construction, same as the old generator's `Model "${node}" cannot reach root` — it just throws because the model is in `clientContract`, not because it's in `contract`.

`validatePush`/`buildPullQueries` also use `clientContract`'s model set as the base legitimacy check: an event or changelog row naming a model absent from it is rejected outright (`{ kind: "unknown-model" }`) before any DAG resolution — a real client can never have generated an event for a model it doesn't have locally.

## Related

- ADR 012 — Client Contract Subsetting (the `rootModel` survival constraint on the client-side projection)
- ADR 013 — FK Projection on Excluded Models (root-reachability check runs against its survivor set)
- ADR 015 — Contract-Derived Validation (payload shape validation runs before DAG resolution on push)
- ADR 177 (upstream) — Ownership replaces relation strategy — the `model.owner` concept this ADR explicitly does not reuse
- `packages/generator/src/fileCreators/batch-processor/createDAG.ts` — direct algorithmic precedent (root reachability BFS, cycle detection)
- `packages/generator/src/fileCreators/batch-processor/create.ts:22-60,290-343` — `buildAllAuthorizationPaths`, push/pull query construction precedent
- `target-idb/src/core/decode-json-record.ts` — precedent for "derive from `contract.domain` at runtime, no generated file"
- `packages/prisma-next/docs/FEEDBACK.md` items 1-2 — the "don't ship server-authoritative logic to the browser" lesson this ADR applies to authorization
- Discord thread with Will Madden, 2026-06-10/11 — dual-DB-state discussion; scoping and migration-lifecycle questions
