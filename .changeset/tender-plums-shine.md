---
"@prisma-next-idb/sync-server-sql": minor
---

Initial release. SQL execution adapter for `@prisma-next-idb/sync-server`: applies authorized push events and resolves pull records against a real Postgres/SQL ORM client, given `sync-server`'s ownership checks. Exposes `createSqlSyncAdapter` (bundling `applyPushEvent`, `toSyncPushPayload`, `resolvePullRecord`, `ormRootFor`, `checkAuthorization`, and `sqlGetKeyField` — the SQL-shaped `getKeyField` resolver for `sync-server`'s `createSyncServer`, since its default only understands IDB's flat `storage.keyPath`).
