# Prisma Next IDB Kanban

A local-only Svelte kanban board backed by Prisma Next IDB.

The example demonstrates explicit Prisma Next migration packages, the browser IndexedDB runtime, and a tiny PWA shell that works offline after the app has loaded once.

## What is included

- Local users, boards, and todos stored in IndexedDB
- Auto-migrating client setup in `src/lib/prisma/db.ts`
- Chainable ORM usage in `src/lib/stores/kanban.svelte.ts`
- Barebones PWA metadata and service worker caching

## Development

From the repository root:

```sh
pnpm --filter @prisma-next-idb/kanban-example dev
```

## Validation

```sh
pnpm --filter @prisma-next-idb/kanban-example check
pnpm --filter @prisma-next-idb/kanban-example build
```

## Prisma Next workflow

```sh
pnpm --filter @prisma-next-idb/kanban-example contract:emit
pnpm --filter @prisma-next-idb/kanban-example migration:generate
pnpm --filter @prisma-next-idb/kanban-example migration:generate-space
pnpm --filter @prisma-next-idb/kanban-example migration:preflight
```

## Links

- Live app: https://next-kanban.prisma-idb.dev/
- Docs: https://prisma-idb.dev/docs/prisma-next/kanban-example
- Source: https://github.com/prisma-idb/idb-client-generator/tree/main/apps/prisma-next-idb-kanban-example
