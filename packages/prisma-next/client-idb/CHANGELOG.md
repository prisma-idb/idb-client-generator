# @prisma-next-idb/client-idb

## 0.3.0

### Minor Changes

- [#208](https://github.com/prisma-idb/idb-client-generator/pull/208) [`f91e806`](https://github.com/prisma-idb/idb-client-generator/commit/f91e8066fd06d18b3e8fba51ee95116222980a32) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - Add `createManagedAutoIdbClient`, a convenience wrapper composing `createManagedIdbClient` with `createAutoMigratingIdbClient`. Threads `dbName`/`factory` once to both the managed wrapper and the underlying auto-migrating factory, instead of requiring callers to hand-compose the two (which meant writing `dbName` in two separate option bags with nothing tying them together — a drift between the two silently makes `reset()` delete the wrong database).

### Patch Changes

- Updated dependencies [[`f91e806`](https://github.com/prisma-idb/idb-client-generator/commit/f91e8066fd06d18b3e8fba51ee95116222980a32)]:
  - @prisma-next-idb/target-idb@0.3.0
  - @prisma-next-idb/adapter-idb@0.3.0
  - @prisma-next-idb/runtime-idb@0.3.0
  - @prisma-next-idb/driver-idb@0.3.0

## 0.2.0

### Minor Changes

- [#205](https://github.com/prisma-idb/idb-client-generator/pull/205) [`fcb4aca`](https://github.com/prisma-idb/idb-client-generator/commit/fcb4aca55f17b3940a6737b3588256429b62ac3c) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - Improved index utilisation on FK-targets and logical conditions; ported PSL parsing and schema verification to the updated @prisma-next APIs, and fixed schema-verify reporting the dotted contract path instead of the plain store name for index-level drift issues.

### Patch Changes

- Updated dependencies []:
  - @prisma-next-idb/target-idb@0.2.0
  - @prisma-next-idb/driver-idb@0.2.0
  - @prisma-next-idb/adapter-idb@0.2.0
  - @prisma-next-idb/runtime-idb@0.2.0

## 0.1.2

### Patch Changes

- [#201](https://github.com/prisma-idb/idb-client-generator/pull/201) [`d7b767b`](https://github.com/prisma-idb/idb-client-generator/commit/d7b767b74dd113f9f8758ef7718c0272a8ddc247) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - Better create operations using separate "add" plan instead of overwriting with "put", improved migration hash validation, better onDelete referential actions handling, improved auto-migration client behavior

- Updated dependencies [[`d7b767b`](https://github.com/prisma-idb/idb-client-generator/commit/d7b767b74dd113f9f8758ef7718c0272a8ddc247)]:
  - @prisma-next-idb/runtime-idb@0.1.2
  - @prisma-next-idb/driver-idb@0.1.2
  - @prisma-next-idb/adapter-idb@0.1.2
  - @prisma-next-idb/target-idb@0.1.2

## 0.1.1

### Patch Changes

- [#195](https://github.com/prisma-idb/idb-client-generator/pull/195) [`52183bd`](https://github.com/prisma-idb/idb-client-generator/commit/52183bdf47848eec028daae53b7328db945dbb78) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - add README files to all packages

- Updated dependencies [[`52183bd`](https://github.com/prisma-idb/idb-client-generator/commit/52183bdf47848eec028daae53b7328db945dbb78)]:
  - @prisma-next-idb/adapter-idb@0.1.1
  - @prisma-next-idb/runtime-idb@0.1.1
  - @prisma-next-idb/driver-idb@0.1.1
  - @prisma-next-idb/target-idb@0.1.1

## 0.1.0

### Minor Changes

- Initial release of the @prisma-next-idb family — a ground-up rewrite using the Prisma extension framework with ContractSpace-driven runtime, replacing the manifest-based generator approach.

### Patch Changes

- Updated dependencies []:
  - @prisma-next-idb/adapter-idb@0.1.0
  - @prisma-next-idb/runtime-idb@0.1.0
  - @prisma-next-idb/driver-idb@0.1.0
  - @prisma-next-idb/target-idb@0.1.0
