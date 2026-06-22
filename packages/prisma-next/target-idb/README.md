# `@prisma-next-idb/target-idb`

> Part of the [`@prisma-next-idb`](https://prisma-idb.dev/) driver stack — IndexedDB for [prisma-next](https://www.prisma.io/blog/prisma-next-call-for-extension-authors).

**target-idb** is the foundation layer. It defines the IDB target pack: store/index identity, DDL op factories, and the migration runner that applies schema changes idempotently on `IDBDatabase` open.

## Stack position

```
family-idb  (CLI / config)
client-idb  (ORM query builder)
runtime-idb (RuntimeCore)
adapter-idb (query AST → IDB plan)
driver-idb  (window.indexedDB wrapper)
target-idb  ← you are here (identity + migrations)
```

## Usage

Consumed internally by the rest of the `@prisma-next-idb` family. You generally do not install this package directly — use [`@prisma-next-idb/family-idb`](https://www.npmjs.com/package/@prisma-next-idb/family-idb) as your entry point.

## License

MIT
