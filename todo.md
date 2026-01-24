# TODO List – `idb-client-generator`

## Introduction

This document outlines the remaining high-impact tasks required to harden the sync architecture of `idb-client-generator`.
The focus is **security, correctness, and DX**, not feature expansion.

At this stage, the core sync pipeline exists. The remaining work ensures:

* sync is *secure by construction*,
* the local IndexedDB client is an *honest projection* of the server schema,
* and server-side validation is *derived, not ad-hoc*.

## 1. Authentication During Push and Pull

### Goal

Ensure **strict scope isolation** during sync.

* A client must **only push changes into its own scope**.
* A client must **only pull changes from its own scope**.
* No trust is placed in client-supplied ownership fields (e.g. `userId` in payloads).

### Push (applyPush)

**Problem:**
Outbox events are untrusted. A malicious client can forge payloads that reference another user’s data.

**Solution:**
During `applyPush`, derive authorization **from server state**, not payload claims.

* Each event is authorized based on:

  * its model
  * its operation (`create | update | delete`)
  * the authenticated session
  * the ownership path derived from relations

**Example (Todo owned via Board → User):**

```ts
// CREATE Todo
const board = await prisma.board.findUnique({
  where: { id: payload.boardId },
  select: { userId: true }
});

if (!board || board.userId !== session.user.id) {
  throw unauthorized();
}
```

Key rules:

* Payload `userId` is ignored for non-root models.
* Authorization always walks **towards the root entity**.
* If ownership cannot be proven → reject the event.

### Pull (materializeLogs)

**Problem:**
Without scope enforcement, a client could fetch another user’s changes.

**Solution:**
Every pull query must be scoped by an **authoritative scope key** (e.g. `userId`, `accountId`).

**Invariant:**

```sql
SELECT *
FROM ChangeLog
WHERE scopeKey = :authenticatedScope
  AND id > :cursor
ORDER BY id;
```

Rules:

* Scope key is derived from authentication, never from client input.
* Cursor is opaque and only advances forward.
* If scope cannot be derived → pull fails closed.

## 2. Generate a Scoped Prisma Client for IndexedDB

### Goal

Create a **local Prisma-like client** whose schema, runtime behavior, and TypeScript types are all consistent—and reflect *only* syncable data.

### Problem

The server Prisma schema contains:

* auth/infrastructure models (`Session`, `Account`, `VerificationToken`)
* relations and foreign keys to those models

These:

* cannot be synced,
* must not block offline writes,
* must not exist in the local IndexedDB schema.

Reusing Prisma types directly causes a mismatch between:

* runtime behavior (tables don’t exist)
* TypeScript types (relations still appear)

### Solution: DMMF Projection

Instead of “patching” Prisma types in TS, **project the schema before types are generated**.

**Approach:**

1. Intercept Prisma’s DMMF in a custom generator.
2. Apply `include / exclude` rules:

   * Remove all non-syncable models.
   * Remove relations and foreign keys pointing to them.
3. Emit a *projected schema* (or projected DMMF).
4. Run Prisma Client generation on this projection.

Result:

* Local client types are correct by construction.
* Unsyncable models literally do not exist locally.
* No phantom relations, no `Omit<>` hacks.

### Example

**Server schema:**

```
User
 ├─ Board
 │   └─ Todo
 └─ Session   (unsyncable)
```

**Local schema (projected):**

```
User
 └─ Board
     └─ Todo
```

* `Session` is completely removed.
* Relations to `Session` are stripped from `User`.
* Local client behaves like a *scoped Prisma client*.

## 3. Generate an Authoritative Dependency DAG

### Goal

Derive **secure, consistent authorization logic** automatically from the schema.

### Core Idea

Every syncable model must be reachable from **exactly one root authority**
(usually `User`, but configurable).

This forms a **directed acyclic graph (DAG)**:

```
User
 └─ Board
     └─ Todo
```

This graph answers:

* “Who owns this record?”
* “Which queries prove ownership?”
* “Which operations are allowed?”

### Why This Matters

Manual authorization logic:

* is repetitive,
* easy to get wrong,
* and dangerous in a sync system.

Instead, authorization should be **derived**, not handwritten.

### Generator Responsibilities

At codegen time:

1. Identify the root entity (e.g. `User`).
2. Build a DAG of all syncable models pointing toward the root.
3. Enforce invariants:
   * every syncable model has exactly one path to the root,
   * no cycles,
   * no dependency on unsyncable models.
4. Generate per-model, per-operation authorization resolvers.

---

### Example (Generated Authorization)

```ts
authorize.Todo = {
  create: ({ payload, session }) =>
    ownsBoard(payload.boardId, session.user.id),

  update: ({ keyPath, session }) =>
    ownsTodo(keyPath[0], session.user.id),

  delete: ({ keyPath, session }) =>
    ownsTodo(keyPath[0], session.user.id),
};
```

All checks:

* are server-side,
* use authoritative data,
* never trust client claims.

## Summary

These tasks complete the transition from:

> “a sync mechanism that works”

to:

> **“a sync system that is secure, correct, and hard to misuse.”**

Once finished:

* local schema ≠ server schema (by design),
* security is enforced structurally,
* and the generated client becomes a true local-first primitive.

This is the last *conceptual* work. Everything after this is execution.

## One-sentence invariant (this is the contract)

> A record is syncable if and only if the server can prove a path from that record to the root authority whose key equals the resolved scopeKey.

Everything else is an implementation detail.
