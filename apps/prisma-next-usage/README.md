# Prisma Next IDB Usage

A SvelteKit app that exercises the Prisma Next IDB family packages end-to-end. It serves as the E2E test host for the `@prisma-next-idb/*` packages and doubles as a minimal reference for how to wire up the client, run migrations, and query IndexedDB with the Prisma Next ORM API.

Sync support is not yet included in this app — it is actively being worked on and will be added once the outbox/sync layer lands in the prisma-next IDB family.

## What is included

- Local data stored in IndexedDB via the Prisma Next IDB runtime
- Auto-migrating client setup demonstrating the ContractSpace-driven migration flow
- Chainable ORM usage through the `idbOrm` query builder
- Playwright E2E tests covering the core CRUD and migration paths

## Development

From the repository root:

```sh
pnpm --filter @prisma-next-idb/usage dev
```

## Validation

```sh
pnpm --filter @prisma-next-idb/usage check
pnpm --filter @prisma-next-idb/usage build
pnpm --filter @prisma-next-idb/usage test:e2e
```

## Prisma Next workflow

```sh
pnpm --filter @prisma-next-idb/usage migration:generate
pnpm --filter @prisma-next-idb/usage migration:generate-space
pnpm --filter @prisma-next-idb/usage migration:preflight
```

## Links

- Docs: https://prisma-idb.dev/docs/prisma-next/usage
- Source: https://github.com/prisma-idb/idb-client-generator/tree/main/apps/prisma-next-usage
