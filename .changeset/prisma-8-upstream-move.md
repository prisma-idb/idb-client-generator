---
"@prisma-next-idb/target-idb": patch
"@prisma-next-idb/driver-idb": patch
"@prisma-next-idb/adapter-idb": patch
"@prisma-next-idb/runtime-idb": patch
"@prisma-next-idb/client-idb": patch
"@prisma-next-idb/family-idb": patch
"@prisma-next-idb/sync-extension-idb": patch
"@prisma-next-idb/sync-server": patch
"@prisma-next-idb/sync-server-sql": patch
---

Moves every package off the archived `@prisma-next/*`-scoped fork onto the packages it merged into upstream: `@prisma/orm-framework`, `@prisma/orm-postgres`, `@prisma/orm-toolchain`, and `@prisma/cli-engine`, all pinned to `8.0.0-rc.5`. This is a mechanical import-path rewrite with no behavior change on its own — the migration content-hash format (bare hex, no `sha256:` prefix) already shipped in an earlier release and is unaffected.

Config files that consuming apps author now follow the upstream-unified `prisma.config.ts` / `prisma.config.postgres.ts` naming (replacing `prisma-next.config.ts`), matching the same `@prisma/cli-engine` envelope every other ORM family uses.
