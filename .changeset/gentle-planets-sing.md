---
"@prisma-next-idb/target-idb": minor
"@prisma-next-idb/family-idb": minor
"@prisma-next-idb/client-idb": minor
---

Add `@default(...)` and bare `@updatedAt` support to the IDB family's PSL interpreter: literal defaults, `now()`, `uuid()`/`uuid(7)`, `cuid()`, and `autoincrement()` (mapped to IndexedDB's native auto-incrementing keys). Fields with an `onCreate` default — including `temporal.updatedAt()` from the previous release — are now correctly optional in `create()`'s input type, not just the primary key.
