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

// Pull: resolve the same shape for each changelog row about to be sent back.
const scoped = syncServer.buildPullQueries(logs, { scopeKey: currentUserId });
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
