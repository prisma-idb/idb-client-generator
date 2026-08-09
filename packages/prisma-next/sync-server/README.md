# @prisma-next-idb/sync-server

Server-side sync ownership DAG (ADR 014). Given a `rootModel` (e.g. `User`), builds an authorization graph from the contract's relations at startup, then resolves per-record ownership checks for push validation and pull scoping. Transport-agnostic: it never touches a database or an HTTP framework — `validatePush`/`buildPullQueries` return _descriptions_ of what to check, and the caller executes them against whatever storage it uses.

Never ships to the browser — this is server-only logic, built specifically so client bundles never carry authorization decisions (see ADR 014's rationale).

## Installation

```bash
pnpm add @prisma-next-idb/sync-server
```

## Quick Start

```ts
import { createSyncServer } from "@prisma-next-idb/sync-server";
import { fullContract } from "./prisma/contract.server";
import { clientContract } from "./prisma/contract.client";

const syncServer = createSyncServer({
  contract: fullContract, // full server contract (ADR 012) — includes client-excluded models
  clientContract, // client-projected contract (ADR 012) — defines what's ever synced
  rootModel: "User",
});

// Push: resolve what each outbox event needs authorized.
const results = syncServer.validatePush(events, { scopeKey: currentUserId });
for (const { eventId, check } of results) {
  if (check.kind === "unknown-model") throw new PermanentSyncError("INVALID_MODEL", eventId);
  if (check.kind === "root") {
    if (!check.authorized) throw new PermanentSyncError("SCOPE_VIOLATION", eventId);
    continue;
  }
  // check.kind === "scoped" — authorized via ANY ONE path resolving to scopeKey.
  const owned = await Promise.any(
    check.paths.map((path) => findFirstAlongPath(prisma, /* model */ eventModel, check.key, path, check.scopeKey))
  ).catch(() => null);
  if (!owned) throw new PermanentSyncError("SCOPE_VIOLATION", eventId);
}

// Pull: `logs` must already be pre-filtered to this caller (see "Pull is two
// steps" below) — buildPullQueries does the live re-check, not the initial fetch.
const scoped = syncServer.buildPullQueries(logs, { scopeKey: currentUserId });
```

## Pull is two steps — `buildPullQueries` is only the second one

`sync-server` doesn't fetch changelog rows; the caller does. The expected shape mirrors the old generator's `pullAndMaterializeLogs`:

1. **Cheap pre-filter, on the caller's own changelog storage.** Stamp the resolved `scopeKey` onto each changelog row at push time (right after `validatePush` authorizes it — reuse the same `scopeKey` you passed in, don't recompute it), then query `WHERE scopeKey = ? AND id > lastChangelogId`. This is an index-friendly filter over the caller's own storage; `sync-server` has no opinion on it and never sees it.
2. **Live re-check, via `buildPullQueries`.** For every row step 1 returned, resolve its current `OwnershipCheck` and have the caller execute it (`findFirst` down `check.paths`, or the root-key comparison) *before* returning the record. This is not redundant with step 1 — it re-derives ownership from the record's live relations, not from what was stamped at push time.

Step 2 exists because a stamped `scopeKey` is a snapshot, and ownership can move after it's taken. Example, kanban:

- Alice creates `Todo T1` under `Board B1`, which she owns. Push authorizes it (`T1 → board → owner === "alice"`), and the caller stamps `scopeKey: "alice"` on that changelog row.
- Later, `B1` is reassigned to Bob (`Board.update({ owner: "bob" })`).
- Alice pulls. Step 1's flat filter (`scopeKey: "alice"`) still returns `T1`'s changelog row — it was true when it was written. Without step 2, Alice's client would materialize `T1` as if she still owned it.
- Step 2 re-resolves live: `check.paths` (`[["board", "owner"]]`) now points at Bob, not Alice, so the caller's query for `T1` scoped to `"alice"` returns nothing — the caller treats that as "no longer accessible" instead of serving stale access.

`SyncPullLogEntry` deliberately has no `scopeKey` field — it isn't `sync-server`'s job to know how you filter your changelog, only to tell you, per row, what's still true right now.

**Known limitation:** this only converges correctly for domains where ownership never shifts away from an already-synced client (e.g. this repo's own MyFit — a user's data is never handed to another user). If a record's ownership chain is reassigned after a client has already synced it, and that client has no further changelog rows of its own pending for it, that client will never receive another row about it — its stale local copy just sits there, even while online. See ADR 014's "Known limitation" section for why, and the deferred live-filter alternative (Firestore/Zero-style) that would fix it for domains that need reassignment safety.

## Schema: no more hand-authored `Changelog` model — for IDB-as-server only

**Scope, read this first:** `Changelog` has to live wherever your *server's* data lives — a real Postgres/Mongo/whatever database, in any normal deployment. `prismaIdbContractWithSync` below wires the injection into `family-idb`'s own PSL loader, which targets **IndexedDB** — a browser-only storage engine that cannot run on a real server at all. It only makes sense here because this repo has no SQL/Mongo family package yet, and its own demo (`kanban-example`) fakes a backend by running `family-idb`'s interpreter a second time (`prisma-next.config.server.ts`, `projection: "full"`) rather than talking to a real database. If your app has a real Postgres/Mongo server, **this function doesn't apply to it** — use `injectChangelogModel` (below) against that family's own schema loader once one exists in this repo; nothing here does that today.

The old generator required a `Changelog` model + `ChangeOperation` enum hand-typed into your `schema.prisma`, and threw one of a dozen validation errors (wrong type, missing `@unique`, extra field, ...) if it drifted from the exact expected shape. For the IDB-as-server case, `sync-server` owns that shape instead — `prismaIdbContractWithSync` is a drop-in replacement for `family-idb`'s `prismaIdbContract` that appends the `Changelog` model to your schema text before it's parsed, so `contract.storage.storageHash` reflects it correctly (see ADR 014's "Schema: Changelog as an authoring extension" for why this has to happen pre-hash, not by post-processing an already-built contract):

```ts
// prisma-next.config.server.ts — never wire this into the client config,
// or the client contract would gain a model it can never have data for.
import { defineConfig } from "@prisma-next-idb/family-idb/config-types";
import { prismaIdbContractWithSync } from "@prisma-next-idb/sync-server/schema";
// ...family/target/adapter/driver imports as usual

export default defineConfig({
  // ...
  contract: prismaIdbContractWithSync("src/lib/prisma/schema.prisma", {
    projection: "full",
    output: "src/lib/prisma/contract.server.json",
  }),
});
```

Your `schema.prisma` never declares `Changelog` at all — there's nothing to get wrong. The injected model:

```prisma
model Changelog {
  id            String @id
  model         String
  keyPath       Json
  operation     String
  scopeKey      String
  outboxEventId String @unique

  @@index([model])
}
```

`operation` is a plain `String`, not a Prisma enum — `family-idb`'s PSL interpreter has no enum support, and the rest of this sync stack (`SyncPushEvent`, `SyncPullLogEntry`) already types it as a `"create" | "update" | "delete"` string union, so this matches rather than downgrades. The index is single-field (`@@index([model])`, not the old generator's compound `[model, id]`) because IDB compound indexes aren't supported yet — `id` is already the primary key, so it's already indexed for cursor scans.

This exact shape is tuned for IDB's constraints (no enums, no compound indexes), not a universal recommendation — a real SQL backend has neither limitation and would likely want the enum and the compound index back. `injectChangelogModel`'s *syntax* is family-portable (vanilla `String`/`Json`/`@id`/`@unique`/`@@index`, no `@idb.*` attributes), but its exact field-by-field choices were made for this repo's only real target today; treat it as a starting point to adapt, not a fixed contract, once a SQL/Mongo family exists.

### Using `injectChangelogModel` directly (family-agnostic)

If you're not going through `prismaIdbContractWithSync` — e.g. building against a different family's schema loader — `injectChangelogModel` is exported on its own:

```ts
import { injectChangelogModel } from "@prisma-next-idb/sync-server/schema";

const schemaWithChangelog = injectChangelogModel(rawSchemaText);
// hand this to whatever your family's own pre-parse hook expects
```

## Why "descriptions", not query results

`sync-server` doesn't know Prisma, SQL, or any specific storage engine — `contract.storage` shape aside, the actual `findFirst`/equivalent lookup is the caller's job. `check.paths` is a list of relation-name chains (e.g. `["todo", "board", "owner"]`); the caller is responsible for turning each chain into a real nested query (or however their storage layer expresses "traverse these relations, then compare the root's key to `scopeKey`") and interpreting a miss as unauthorized.

## API

### `createSyncServer({ contract, clientContract, rootModel })`

Builds the ownership DAG once — throws immediately on a broken schema (a cycle, or a client-synced model with no relation chain back to `rootModel`) rather than per-request. Returns a `SyncServer`:

- `validatePush(events, { scopeKey })` — resolves an `OwnershipCheck` per event.
- `buildPullQueries(logs, { scopeKey })` — resolves an `OwnershipCheck` per changelog row.

### `OwnershipCheck`

| `kind`            | Meaning                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| `"unknown-model"` | The model isn't in `clientContract` — a real client could never have produced this. Reject outright.     |
| `"root"`          | The record _is_ the root model — `authorized` is already computed (`key === scopeKey`), no query needed. |
| `"scoped"`        | Non-root record — authorized if _any one_ of `paths` resolves to `scopeKey` when the caller queries it.  |

### Lower-level exports

- `buildOwnershipDag(contract, clientContract, rootModel)` — the DAG construction + validation on its own.
- `resolveAuthorizationPaths(contract, rootModel, modelName)` — every relation-name chain from `modelName` to `rootModel`, shortest first.

### `@prisma-next-idb/sync-server/schema`

- `prismaIdbContractWithSync(schemaPath, options?)` — same as `family-idb`'s `prismaIdbContract`, plus the injected `Changelog` model. Server config only.
