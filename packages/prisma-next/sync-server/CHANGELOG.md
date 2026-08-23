# @prisma-next-idb/sync-server

## 0.2.3

### Patch Changes

- [#215](https://github.com/prisma-idb/idb-client-generator/pull/215) [`a536222`](https://github.com/prisma-idb/idb-client-generator/commit/a536222379c2d16ddd66c75ae0c0e4e948ea67a0) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - Moves every package off the archived `@prisma-next/*`-scoped fork onto the packages it merged into upstream: `@prisma/orm-framework`, `@prisma/orm-postgres`, `@prisma/orm-toolchain`, and `@prisma/cli-engine`, all pinned to `8.0.0-rc.5`. This is a mechanical import-path rewrite with no behavior change on its own — the migration content-hash format (bare hex, no `sha256:` prefix) already shipped in an earlier release and is unaffected.

  Config files that consuming apps author now follow the upstream-unified `prisma.config.ts` / `prisma.config.postgres.ts` naming (replacing `prisma-next.config.ts`), matching the same `@prisma/cli-engine` envelope every other ORM family uses.

- Updated dependencies [[`a536222`](https://github.com/prisma-idb/idb-client-generator/commit/a536222379c2d16ddd66c75ae0c0e4e948ea67a0), [`a536222`](https://github.com/prisma-idb/idb-client-generator/commit/a536222379c2d16ddd66c75ae0c0e4e948ea67a0), [`a536222`](https://github.com/prisma-idb/idb-client-generator/commit/a536222379c2d16ddd66c75ae0c0e4e948ea67a0), [`a536222`](https://github.com/prisma-idb/idb-client-generator/commit/a536222379c2d16ddd66c75ae0c0e4e948ea67a0)]:
  - @prisma-next-idb/family-idb@0.6.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`dc9b4ec`](https://github.com/prisma-idb/idb-client-generator/commit/dc9b4eceb33e3f94898a4eae28e3f9ba3886bc09)]:
  - @prisma-next-idb/family-idb@0.5.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`d54b62d`](https://github.com/prisma-idb/idb-client-generator/commit/d54b62db76c7ff242511c0c010d5f983d9bceb25)]:
  - @prisma-next-idb/family-idb@0.4.0

## 0.2.0

### Minor Changes

- [#208](https://github.com/prisma-idb/idb-client-generator/pull/208) [`88bcc88`](https://github.com/prisma-idb/idb-client-generator/commit/88bcc8814bfc6b0bcbe1f6c2531382a23faba223) Thanks [@WhyAsh5114](https://github.com/WhyAsh5114)! - Initial release. Server-side sync ownership DAG (ADR 014): given a `rootModel`, builds an authorization graph from the contract's relations at startup, then resolves per-record ownership checks for push validation and pull scoping. Transport- and storage-agnostic — `validatePush`/`buildPullQueries` return descriptions of what to check, and the caller executes them. Family-agnostic aside from one pluggable primary-key resolution point (`getKeyField`), defaulting to IDB's shape.

### Patch Changes

- Updated dependencies [[`88bcc88`](https://github.com/prisma-idb/idb-client-generator/commit/88bcc8814bfc6b0bcbe1f6c2531382a23faba223)]:
  - @prisma-next-idb/family-idb@0.3.0
