---
"@prisma-next-idb/family-idb": minor
---

`migration plan` now writes each distinct contract exactly once per migrations root, in a content-addressed store at `migrations/snapshots/<storageHash>/contract.{json,d.ts}` (ADR 240), instead of a `start-contract.*`/`end-contract.*` copy inside every migration package directory. Writes are write-if-absent (contract emission is already deterministic) and go through a temp-dir-then-rename so an interrupted write can never leave a partial store entry visible under its real hash. `snapshots` is now a reserved space id — `migration plan` refuses it, and the existing-package directory scan for extension spaces (which share `migrationsDir` directly, with no `app/` subdirectory) no longer mistakes the shared store for a migration package.

**Breaking:** any tooling reading a migration package's `end-contract.json`/`end-contract.d.ts` directly needs to resolve `migrations/snapshots/<head migration's "to" hash>/contract.json` instead. `migration plan`'s head-consistency check is also simpler now: since the file's address _is_ the hash, the only failure mode left is a missing store entry, which now fails with its own explicit error message.
