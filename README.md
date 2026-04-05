# Prisma IDB

> You already write Prisma on the server. Now write it in the browser.

A Prisma generator that creates a type-safe IndexedDB client with the API you already know — plus an optional sync engine that handles conflict resolution, ownership, and offline-first data for you.

**[Documentation](https://prisma-idb.dev/) · [Live Demo](https://kanban.prisma-idb.dev/) · [npm](https://www.npmjs.com/package/@prisma-idb/idb-client-generator)**

---

## The difference

Even with the [`idb`](https://github.com/jakearchibald/idb) library, querying across relations means manual index lookups, joins in application code, and zero type safety:

```typescript
const db = await openDB("MyDB", 1);

const posts = await db.getAllFromIndex("posts", "byAuthor", userId);

const result = [];
for (const post of posts) {
  if (!post.published) continue;
  const comments = await db.getAllFromIndex("comments", "byPost", post.id);
  result.push({ ...post, comments });
}
result.sort((a, b) => b.createdAt - a.createdAt);
// manual joins, no types, no filtering
```

Prisma IDB:

```typescript
const posts = await idb.post.findMany({
  where: { authorId: userId, published: true },
  include: {
    comments: { orderBy: { createdAt: "desc" } },
  },
  orderBy: { createdAt: "desc" },
});
```

Same API as Prisma Client. Fully typed. Works offline.

## And when you need sync...

Most IndexedDB libraries stop at CRUD. This one includes a bidirectional sync engine that handles the hard parts:

```prisma
generator prismaIDB {
  provider   = "idb-client-generator"
  output     = "./prisma-idb"
  outboxSync = true    // ← one flag
  rootModel  = "User"
}
```

- **Outbox pattern** — mutations queue locally, push reliably with retry and batching
- **Ownership DAG** — authorization is structural, every record traces back to its owner
- **Conflict resolution** — server-authoritative changelog materialization on pull

## Quick Start

### Install

```bash
pnpm add idb
pnpm add @prisma-idb/idb-client-generator --save-dev
```

### Configure

Add the generator to your `schema.prisma`:

```prisma
generator prismaIDB {
  provider = "idb-client-generator"
  output   = "./prisma-idb"
}

model Todo {
  id    String  @id @default(cuid())
  title String
  done  Boolean @default(false)
}
```

### Generate & Use

```bash
pnpm exec prisma generate
```

```typescript
import { PrismaIDBClient } from "./prisma-idb";

const idb = await PrismaIDBClient.createClient();

// Create
await idb.todo.create({
  data: { title: "Ship it", done: false },
});

// Read
const todos = await idb.todo.findMany({
  where: { done: false },
});

// Update
await idb.todo.update({
  where: { id: todoId },
  data: { done: true },
});

// Delete
await idb.todo.delete({
  where: { id: todoId },
});
```

## Features

- **Prisma-compatible API** — `create`, `findMany`, `findUnique`, `update`, `delete`, `upsert`, and more
- **Full type safety** — generated from your Prisma schema with complete autocomplete
- **Relations** — `include` and `select` work as expected
- **Offline-first** — all data in IndexedDB, zero network dependency
- **Optional sync** — bidirectional server sync with conflict resolution and authorization
- **Client-generated IDs** — `cuid` or `uuid`, no server round-trip for creates

## Resources

- [Documentation](https://prisma-idb.dev/)
- [Live Kanban Demo](https://kanban.prisma-idb.dev/)
- [npm Package](https://www.npmjs.com/package/@prisma-idb/idb-client-generator)
- [Example App Source](./apps/pidb-kanban-example)

## Contributing

Contributions welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Security

See [SECURITY.md](./SECURITY.md) for reporting vulnerabilities.

## License

AGPL-3.0. See [LICENSE](./LICENSE).

## Disclaimer

Prisma is a trademark of Prisma. Prisma IDB is an independent open-source project, not affiliated with or endorsed by Prisma.
