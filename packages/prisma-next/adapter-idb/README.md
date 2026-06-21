# `@prisma-next-idb/adapter-idb`

> Part of the [`@prisma-next-idb`](https://prisma-idb.dev/) family — IndexedDB support for the Prisma extension framework.

**adapter-idb** is the translation layer. It lowers the Prisma query AST into an opaque IDB plan body that the driver can execute.

## Stack position

```
family-idb  (CLI / config)
client-idb  (ORM query builder)
runtime-idb (RuntimeCore)
adapter-idb ← you are here (query AST → IDB plan)
driver-idb  (window.indexedDB wrapper)
target-idb  (identity + migrations)
```

## Usage

Consumed internally by the rest of the `@prisma-next-idb` family. You generally do not install this package directly — use [`@prisma-next-idb/family-idb`](https://www.npmjs.com/package/@prisma-next-idb/family-idb) as your entry point.

## License

MIT
