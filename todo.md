## Invariants

- [x] Invariant 1 — Ownership

  > A record is syncable if and only if the server can prove a path from that record to the root authority whose key equals the resolved scopeKey.

- [x] Invariant 2 — Authorship

  > Local state is authoritative for local-origin changes. Remote state is authoritative only for foreign-origin changes.

- [x] Invariant 3 — Idempotency

  > A client-originated intent must be applied at most once on the server.

- [x] Invariant 4 — Ordering

  > All replicas must observe foreign-origin changes in a single, consistent total order.

Why this set is minimal and complete
| Problem            | Covered by  |
| ------------------ | ----------- |
| Cross-user attacks | Invariant 1 |
| Echo conflicts     | Invariant 2 |
| Retry duplication  | Invariant 3 |
| Divergent state    | Invariant 4 |

## Schema assumptions (v1 using LWW)

### Single authoritative root
Every syncable record must have a directed, acyclic path to a single root model (e.g. User, Workspace).

### Globally unique IDs
All syncable models must use client-generated unique identifiers (UUID/ULID). Auto-increment IDs are not supported.

### Resurrection semantics
Updates to missing records recreate them. Deletes are not terminal.

### Owned relations only
All syncable relations must be part of the ownership DAG and scoped to a single root.
