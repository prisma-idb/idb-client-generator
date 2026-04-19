# Benchmark App

Local-first benchmark dashboard for Prisma IDB generated clients.

## Commands

- `pnpm --filter @prisma-idb/benchmark dev`
- `pnpm --filter @prisma-idb/benchmark build`
- `pnpm --filter @prisma-idb/benchmark start`
- `pnpm --filter @prisma-idb/benchmark benchmark:ci`
- `pnpm --filter @prisma-idb/benchmark benchmark:compare --baseline ../../benchmarks/baselines/main.json --current ../../benchmarks/results/current.json --threshold 10`

## What it measures (MVP)

- CRUD: create user, createMany todo, updateMany todo, deleteMany todo
- Query/filter: findMany by completion, findMany with title contains
- Read patterns: sorted reads, paginated reads, and relation include reads

## Output artifacts

- JSON export
- Local run history persisted in browser storage

## Notes

- Benchmarks run fully in the browser against IndexedDB.
- Results are environment-specific; compare runs on the same machine/browser profile.

## CI Regression Gate

- CI runs benchmarks in headless Chromium via Playwright using `/?autoStart` with config query params.
- The default benchmark preset uses 20 measured runs so p95 is estimated from a meaningful sample size.
- Baseline snapshot is stored in `benchmarks/baselines/main.json` and refreshed on successful pushes to `main`.
- PR checks do **not** trust the baseline file from the PR branch; they load the baseline from the PR base commit on `main`.
- PR runs compare current results against baseline and fail if any operation p95 latency regresses by more than 10%.
- If the trusted snapshot comparison is still advisory, CI benchmarks the PR base commit directly using the same config and uses that run for the final gate.
- If baseline and current runs use insufficient or mismatched sample counts, the comparison is reported as advisory instead of enforcing.
- Newly added benchmark operations are reported in PR comments but do not fail the gate; removing baseline operations fails the gate.
- CI posts a sticky PR comment with a per-operation delta table.
