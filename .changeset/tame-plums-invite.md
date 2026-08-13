---
"@prisma-next-idb/family-idb": minor
---

`prisma-next-idb` now resolves `--contract` and `--migrations-dir` from `prisma-next.config.ts` (via `@prisma-next/config-loader`, the same loader `prisma-next contract emit` uses) instead of hardcoded `src/lib/prisma/...` paths — projects with a non-default `contract.output` or `migrations.dir` no longer need to pass those flags on every invocation.

The command surface is also restructured to mirror `prisma-next`'s own `<group> <verb>` shape:

- `generate-baseline` and `generate-migration` are merged into a single auto-detecting `migration plan`, which picks greenfield vs. incremental based on whether the target space already has migration packages on disk (and prints a warning if it falls back to greenfield unexpectedly).
- `generate-contract-space` is renamed to `migration contract-space`.
- `preflight` is renamed to `migration preflight`.

**Breaking:** the old flat command names (`generate-baseline`, `generate-migration`, `generate-contract-space`, `preflight`) no longer exist — update any `package.json` scripts or CI invocations to the `migration <verb>` form.
