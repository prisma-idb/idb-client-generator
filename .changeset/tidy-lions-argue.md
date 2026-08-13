---
"@prisma-next-idb/target-idb": minor
---

Fix `openAndUpgrade` not rejecting when batched marker writes fail mid-upgrade, which left callers hanging indefinitely instead of surfacing the error. Apply multi-space migrations within a single transaction. Expose `writeMarkers`, `renderMigrationTs`, and `decodeJsonRecord` from the browser-safe runtime/migration export surfaces.
