# @prisma-next-idb/sync-server-sql

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @prisma-next-idb/sync-server@0.2.1

## 0.2.0

### Minor Changes

- [#208](https://github.com/prisma-idb/idb-client-generator/pull/208) [`f91e806`](https://github.com/prisma-idb/idb-client-generator/commit/f91e8066fd06d18b3e8fba51ee95116222980a32) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - Initial release. SQL execution adapter for `@prisma-next-idb/sync-server`: applies authorized push events and resolves pull records against a real Postgres/SQL ORM client, given `sync-server`'s ownership checks. Exposes `createSqlSyncAdapter` (bundling `applyPushEvent`, `toSyncPushPayload`, `resolvePullRecord`, `ormRootFor`, `checkAuthorization`, and `sqlGetKeyField` — the SQL-shaped `getKeyField` resolver for `sync-server`'s `createSyncServer`, since its default only understands IDB's flat `storage.keyPath`).

### Patch Changes

- Updated dependencies [[`88bcc88`](https://github.com/prisma-idb/idb-client-generator/commit/88bcc8814bfc6b0bcbe1f6c2531382a23faba223)]:
  - @prisma-next-idb/sync-server@0.2.0
