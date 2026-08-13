# @prisma-next-idb/sync-extension-idb

## 0.2.0

### Minor Changes

- [#208](https://github.com/prisma-idb/idb-client-generator/pull/208) [`88bcc88`](https://github.com/prisma-idb/idb-client-generator/commit/88bcc8814bfc6b0bcbe1f6c2531382a23faba223) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - Initial release. Browser-side outbox sync extension for the Prisma Next IDB family: wraps an IDB ORM client to atomically write outbox events alongside every mutation, then provides a `SyncWorker` that pushes those events to a server and pulls remote changes back, plus a managed IDB client for singleton/race-safe access and retryable outbox event handling with `localChangePending` tracking. `createManagedAutoSyncIdbClient` composes the managed wrapper with `createAutoMigratingSyncIdbClient` in one call, so `dbName` only needs to be written once.

  This package previously shipped with no test coverage. Its first suite (unit + real-browser multi-tab Playwright) surfaced and fixed three bugs that were live in the previous unreleased build: relation traversal always threw, the push query built an invalid boolean `IDBKeyRange`, and pull unconditionally skipped every log entry.

### Patch Changes

- Updated dependencies [[`f91e806`](https://github.com/prisma-idb/idb-client-generator/commit/f91e8066fd06d18b3e8fba51ee95116222980a32), [`88bcc88`](https://github.com/prisma-idb/idb-client-generator/commit/88bcc8814bfc6b0bcbe1f6c2531382a23faba223), [`f91e806`](https://github.com/prisma-idb/idb-client-generator/commit/f91e8066fd06d18b3e8fba51ee95116222980a32)]:
  - @prisma-next-idb/client-idb@0.3.0
  - @prisma-next-idb/family-idb@0.3.0
  - @prisma-next-idb/target-idb@0.3.0
  - @prisma-next-idb/adapter-idb@0.3.0
  - @prisma-next-idb/runtime-idb@0.3.0
  - @prisma-next-idb/driver-idb@0.3.0
