---
"@prisma-next-idb/runtime-idb": minor
"@prisma-next-idb/driver-idb": minor
"@prisma-next-idb/client-idb": minor
---

`IdbRuntime.execute()` is split into `query()` (returns rows, as an `AsyncIterableResult<Row>`) and `execute()` (returns `RuntimeStatementStats` — `{ affectedRows }` — for statements run purely for their side effects), mirroring the upstream `RuntimeCore` split. Every internal call site (`client-idb`'s store accessor, relation loader, mutation executor) has moved to `query()`.

Alongside the split, `driver-idb`'s delete execution now walks a cursor instead of calling `store.delete(key)` directly, so both single-key and range (`deleteMany`) deletes echo back the rows they actually removed and report an accurate `affectedRows` count — previously delete always resolved with an empty result regardless of what was deleted.

**Breaking:** anything constructing or calling `IdbRuntime` directly (not through `client-idb`'s generated client) must switch its read paths from `execute()` to `query()`; `execute()` now returns statement stats, not rows.
