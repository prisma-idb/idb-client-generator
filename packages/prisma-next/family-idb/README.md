# `@prisma-next-idb/family-idb`

> The [prisma-next](https://www.prisma.io/blog/prisma-next-call-for-extension-authors) driver + adapter + target stack for IndexedDB — offline-first, no server required.

**family-idb** is the main entry point for the `@prisma-next-idb` stack. It exposes the control-plane descriptor, the family instance, and the `prisma-next-idb` CLI for code generation and config integration.

## Stack

```
family-idb  ← you are here (CLI / config / entry point)
client-idb  (ORM query builder)
runtime-idb (RuntimeCore)
adapter-idb (query AST → IDB plan)
driver-idb  (window.indexedDB wrapper)
target-idb  (identity + migrations)
```

## Installation

```bash
npm install @prisma-next-idb/family-idb
```

## Documentation

See [prisma-idb.dev](https://prisma-idb.dev/) for full setup and usage docs.

## License

MIT
