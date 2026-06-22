# `@prisma-next-idb/runtime-idb`

> Part of the [`@prisma-next-idb`](https://prisma-idb.dev/) driver stack — IndexedDB for [prisma-next](https://www.prisma.io/blog/prisma-next-call-for-extension-authors).

**runtime-idb** is the `RuntimeCore` subclass that wires together the adapter and driver into a complete prisma-next runtime.

## Stack position

```
family-idb  (CLI / config)
client-idb  (ORM query builder)
runtime-idb ← you are here (RuntimeCore)
adapter-idb (query AST → IDB plan)
driver-idb  (window.indexedDB wrapper)
target-idb  (identity + migrations)
```

## Usage

Consumed internally by the rest of the `@prisma-next-idb` family. You generally do not install this package directly — use [`@prisma-next-idb/family-idb`](https://www.npmjs.com/package/@prisma-next-idb/family-idb) as your entry point.

## License

MIT
