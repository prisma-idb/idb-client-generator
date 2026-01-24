- [x] Invariant 1 — Ownership

  > A record is syncable if and only if the server can prove a path from that record to the root authority whose key equals the resolved scopeKey.

- [ ] Invariant 2 — Authorship

  > Local state is authoritative for local-origin changes. Remote state is authoritative only for foreign-origin changes.

  - Send `originId` and `outboxId` to `applyPush()`
  - Ignore events with same `originId`

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

