---
"@prisma-next-idb/client-idb": minor
---

Add `createManagedAutoIdbClient`, a convenience wrapper composing `createManagedIdbClient` with `createAutoMigratingIdbClient`. Threads `dbName`/`factory` once to both the managed wrapper and the underlying auto-migrating factory, instead of requiring callers to hand-compose the two (which meant writing `dbName` in two separate option bags with nothing tying them together — a drift between the two silently makes `reset()` delete the wrong database).
