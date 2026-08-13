# @prisma-next-idb/sync-server

## 0.2.0

### Minor Changes

- [#208](https://github.com/prisma-idb/idb-client-generator/pull/208) [`88bcc88`](https://github.com/prisma-idb/idb-client-generator/commit/88bcc8814bfc6b0bcbe1f6c2531382a23faba223) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - Initial release. Server-side sync ownership DAG (ADR 014): given a `rootModel`, builds an authorization graph from the contract's relations at startup, then resolves per-record ownership checks for push validation and pull scoping. Transport- and storage-agnostic — `validatePush`/`buildPullQueries` return descriptions of what to check, and the caller executes them. Family-agnostic aside from one pluggable primary-key resolution point (`getKeyField`), defaulting to IDB's shape.

### Patch Changes

- Updated dependencies [[`88bcc88`](https://github.com/prisma-idb/idb-client-generator/commit/88bcc8814bfc6b0bcbe1f6c2531382a23faba223)]:
  - @prisma-next-idb/family-idb@0.3.0
