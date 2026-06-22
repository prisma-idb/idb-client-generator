# Contributing

Thank you for considering a contribution! This repo is a pnpm monorepo managed with Turborepo. It contains two separate generator families:

| Path                     | Scope                              | Description                                  |
| ------------------------ | ---------------------------------- | -------------------------------------------- |
| `packages/generator`     | `@prisma-idb/idb-client-generator` | Legacy Prisma generator (stable, published)  |
| `packages/prisma-next/*` | `@prisma-next-idb/*`               | New framework-native IDB family (6 packages) |

## Setup

Requires Node.js ≥ 20 and pnpm.

```bash
git clone https://github.com/prisma-idb/idb-client-generator
cd idb-client-generator
pnpm install
```

## Development

### Working on `packages/prisma-next/*`

Build all six packages:

```bash
pnpm build --filter=@prisma-next-idb/*
```

Run unit tests:

```bash
pnpm test:prisma-next
```

Run the browser E2E suite (requires Playwright browsers installed once):

```bash
cd apps/prisma-next-usage && pnpm exec playwright install --with-deps && cd ../..
pnpm test:prisma-next-e2e
```

Type-check (catches things vitest/esbuild won't):

```bash
pnpm check
```

> The known local trap: `pnpm test` passes on type errors because vitest uses esbuild. Always run `pnpm check` before pushing. If Playwright specs all fail at fixture setup, suspect a client-init crash — check the page's error alert, not the spec output.

### Working on `packages/generator`

```bash
pnpm build --filter=@prisma-idb/idb-client-generator

# Regenerate the demo client and start the dev server
cd apps/usage
pnpm exec prisma generate
pnpm dev
```

### Formatting and linting

```bash
pnpm format   # write
pnpm lint     # check
```

## Submitting a PR

1. Branch from `main`, use a descriptive name (`fix/...`, `feat/...`).
2. If your change touches a `@prisma-next-idb/*` package, add a changeset describing what changed:
   ```bash
   pnpm changeset
   ```
   If your PR is docs-only or otherwise doesn't warrant a release, add an empty one to keep CI green:
   ```bash
   pnpm changeset --empty
   ```
3. Open a PR against `main` and describe what changed and why.

---

Please adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).
