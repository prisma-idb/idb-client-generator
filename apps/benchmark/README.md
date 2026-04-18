# Benchmark App

Local-first benchmark dashboard for Prisma IDB generated clients.

## Commands

- `pnpm --filter @prisma-idb/benchmark dev`
- `pnpm --filter @prisma-idb/benchmark build`
- `pnpm --filter @prisma-idb/benchmark start`

## What it measures (MVP)

- CRUD: create user, createMany todo, updateMany todo, deleteMany todo
- Query/filter: findMany by completion, findMany with title contains

## Output artifacts

- JSON export
- CSV export
- Markdown summary export
- Local run history persisted in browser storage

## Notes

- Benchmarks run fully in the browser against IndexedDB.
- Results are environment-specific; compare runs on the same machine/browser profile.
