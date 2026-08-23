---
"@prisma-next-idb/family-idb": patch
---

`prisma-next-idb`'s CLI is rebuilt on `@prisma/cli-engine`'s command-definition primitives instead of a hand-rolled argument parser and output writer. The command surface is unchanged (`migration plan`, `migration contract-space`, `migration preflight`, same flags, same `--json` mode), but every command now goes through the same sink-collection and error-presentation path the engine gives every other ORM family's CLI, instead of writing to `process.stdout`/`process.stderr` directly.
