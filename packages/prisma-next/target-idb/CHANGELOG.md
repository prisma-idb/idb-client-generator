# @prisma-next-idb/target-idb

## 0.4.0

### Minor Changes

- [#211](https://github.com/prisma-idb/idb-client-generator/pull/211) [`d54b62d`](https://github.com/prisma-idb/idb-client-generator/commit/d54b62db76c7ff242511c0c010d5f983d9bceb25) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - Add `@default(...)` and bare `@updatedAt` support to the IDB family's PSL interpreter: literal defaults, `now()`, `uuid()`/`uuid(7)`, `cuid()`, and `autoincrement()` (mapped to IndexedDB's native auto-incrementing keys). Fields with an `onCreate` default — including `temporal.updatedAt()` from the previous release — are now correctly optional in `create()`'s input type, not just the primary key.

## 0.3.0

### Minor Changes

- [#208](https://github.com/prisma-idb/idb-client-generator/pull/208) [`f91e806`](https://github.com/prisma-idb/idb-client-generator/commit/f91e8066fd06d18b3e8fba51ee95116222980a32) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - Fix `openAndUpgrade` not rejecting when batched marker writes fail mid-upgrade, which left callers hanging indefinitely instead of surfacing the error. Apply multi-space migrations within a single transaction. Expose `writeMarkers`, `renderMigrationTs`, and `decodeJsonRecord` from the browser-safe runtime/migration export surfaces.

## 0.2.0

## 0.1.2

## 0.1.1

### Patch Changes

- [#195](https://github.com/prisma-idb/idb-client-generator/pull/195) [`52183bd`](https://github.com/prisma-idb/idb-client-generator/commit/52183bdf47848eec028daae53b7328db945dbb78) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - add README files to all packages

## 0.1.0

### Minor Changes

- Initial release of the @prisma-next-idb family — a ground-up rewrite using the Prisma extension framework with ContractSpace-driven runtime, replacing the manifest-based generator approach.
