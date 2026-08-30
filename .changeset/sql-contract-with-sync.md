---
"@prisma-next-idb/sync-server": minor
---

Replace `writeSqlSchemaWithSync` with `sqlContractWithSync`, a file-free version of the same transform: it decomposes the SQL family's `prismaContract()` into its component parts and substitutes an in-memory `load()`, so the sync `Changelog` model can be injected into a real server schema without ever writing a generated `.prisma` file to disk (see [prisma/orm#30115](https://github.com/prisma/orm/issues/30115)). It needs the core `defineConfig` wired by hand rather than a target's convenience wrapper (which only accepts a schema path for `contract`) — see the README for the full example.

Also adds `@prisma-next-idb/sync-server/postgres`, a `defineConfig({ schema, output?, db?, migrations? })` facade that hides that wiring for the common Postgres case — mirroring the pattern `@prisma/orm-postgres/config` itself uses.

**Breaking:** `writeSqlSchemaWithSync` is removed. Pre-1.0, so this ships as a minor bump rather than major.

**Migration note:** if your `schema.prisma` still has a hand-authored `Changelog` model or `ChangeOperation` enum from before either helper existed, delete them — `sqlContractWithSync`/`@prisma-next-idb/sync-server/postgres` append both, and leaving your own declarations in place produces duplicate PSL declarations that fail contract generation.
