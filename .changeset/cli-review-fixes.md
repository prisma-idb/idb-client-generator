---
"@prisma-next-idb/family-idb": patch
---

Fixes two gaps found in review of the `@prisma/cli-engine` CLI shell:

- `migration contract-space --out <path>` now resolves a relative path against the command's own `cwd`, matching `--contract`/`--migrations-dir` — previously it was passed straight to `writeFile` unresolved, which happened to work only because the shipped binary always has `cwd === process.cwd()`.
- A contract-snapshot store entry that was written before its source `contract.d.ts` existed (see the existing warning) now gets `contract.d.ts` backfilled on the next `migration plan` for the same hash, instead of staying permanently `contract.json`-only.
