# @prisma-next-idb/family-idb

## 0.4.0

### Minor Changes

- [#211](https://github.com/prisma-idb/idb-client-generator/pull/211) [`d54b62d`](https://github.com/prisma-idb/idb-client-generator/commit/d54b62db76c7ff242511c0c010d5f983d9bceb25) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - Add `@default(...)` and bare `@updatedAt` support to the IDB family's PSL interpreter: literal defaults, `now()`, `uuid()`/`uuid(7)`, `cuid()`, and `autoincrement()` (mapped to IndexedDB's native auto-incrementing keys). Fields with an `onCreate` default — including `temporal.updatedAt()` from the previous release — are now correctly optional in `create()`'s input type, not just the primary key.

### Patch Changes

- Updated dependencies [[`d54b62d`](https://github.com/prisma-idb/idb-client-generator/commit/d54b62db76c7ff242511c0c010d5f983d9bceb25)]:
  - @prisma-next-idb/target-idb@0.4.0

## 0.3.0

### Minor Changes

- [#208](https://github.com/prisma-idb/idb-client-generator/pull/208) [`88bcc88`](https://github.com/prisma-idb/idb-client-generator/commit/88bcc8814bfc6b0bcbe1f6c2531382a23faba223) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - `prisma-next-idb` now resolves `--contract` and `--migrations-dir` from `prisma-next.config.ts` (via `@prisma-next/config-loader`, the same loader `prisma-next contract emit` uses) instead of hardcoded `src/lib/prisma/...` paths — projects with a non-default `contract.output` or `migrations.dir` no longer need to pass those flags on every invocation.

  The command surface is also restructured to mirror `prisma-next`'s own `<group> <verb>` shape:

  - `generate-baseline` and `generate-migration` are merged into a single auto-detecting `migration plan`, which picks greenfield vs. incremental based on whether the target space already has migration packages on disk (and prints a warning if it falls back to greenfield unexpectedly).
  - `generate-contract-space` is renamed to `migration contract-space`.
  - `preflight` is renamed to `migration preflight`.

  **Breaking:** the old flat command names (`generate-baseline`, `generate-migration`, `generate-contract-space`, `preflight`) no longer exist — update any `package.json` scripts or CI invocations to the `migration <verb>` form.

### Patch Changes

- Updated dependencies [[`f91e806`](https://github.com/prisma-idb/idb-client-generator/commit/f91e8066fd06d18b3e8fba51ee95116222980a32)]:
  - @prisma-next-idb/target-idb@0.3.0

## 0.2.0

### Patch Changes

- [#205](https://github.com/prisma-idb/idb-client-generator/pull/205) [`fcb4aca`](https://github.com/prisma-idb/idb-client-generator/commit/fcb4aca55f17b3940a6737b3588256429b62ac3c) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - Improved index utilisation on FK-targets and logical conditions; ported PSL parsing and schema verification to the updated @prisma-next APIs, and fixed schema-verify reporting the dotted contract path instead of the plain store name for index-level drift issues.

- Updated dependencies []:
  - @prisma-next-idb/target-idb@0.2.0

## 0.1.2

### Patch Changes

- [#201](https://github.com/prisma-idb/idb-client-generator/pull/201) [`d7b767b`](https://github.com/prisma-idb/idb-client-generator/commit/d7b767b74dd113f9f8758ef7718c0272a8ddc247) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - Better create operations using separate "add" plan instead of overwriting with "put", improved migration hash validation, better onDelete referential actions handling, improved auto-migration client behavior

- Updated dependencies []:
  - @prisma-next-idb/target-idb@0.1.2

## 0.1.1

### Patch Changes

- [#195](https://github.com/prisma-idb/idb-client-generator/pull/195) [`52183bd`](https://github.com/prisma-idb/idb-client-generator/commit/52183bdf47848eec028daae53b7328db945dbb78) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - add README files to all packages

- Updated dependencies [[`52183bd`](https://github.com/prisma-idb/idb-client-generator/commit/52183bdf47848eec028daae53b7328db945dbb78)]:
  - @prisma-next-idb/target-idb@0.1.1

## 0.1.0

### Minor Changes

- Initial release of the @prisma-next-idb family — a ground-up rewrite using the Prisma extension framework with ContractSpace-driven runtime, replacing the manifest-based generator approach.

### Patch Changes

- Updated dependencies []:
  - @prisma-next-idb/target-idb@0.1.0
