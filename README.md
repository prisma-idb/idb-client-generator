# Prisma IndexedDB Client Generator

A **Prisma generator** that creates a familiar, type-safe client for IndexedDB with optional **bidirectional synchronization** to a remote server. Define your data model once in Prisma schema, and get both a local-first IndexedDB client and a complete sync engine built for conflict resolution and authorization.

## Features

- **Prisma-like API**: Use the syntax you already know. CRUD operations feel exactly like Prisma Client.
- **Type Safety**: Fully typed operations generated directly from your Prisma schema.
- **Local-First**: All data lives in IndexedDB. Works offline, syncs when ready.
- **Optional Sync Engine**: Bidirectional sync with authoritative DAG-based conflict resolution.
- **Authorization & Ownership**: Built-in ownership invariants ensure users can only modify their data.
- **Outbox Pattern**: Reliable push operations with automatic retry and batch support.
- **Changelog Materialization**: Efficient pull operations that materialize server state for clients.

## Quick Start

Get Prisma IDB up and running in just a few steps.

### 1. Install Dependencies

```bash
pnpm add idb
pnpm add @prisma-idb/idb-client-generator --save-dev
```

Optionally, for auto-generated IDs:
```bash
pnpm add @paralleldrive/cuid2 uuid
```

### 2. Configure Generator

Add the generator to your `prisma/schema.prisma`:

```prisma
generator prismaIDB {
  provider = "idb-client-generator"
  output   = "./prisma-idb"
  
  // Optional: Enable sync engine
  outboxSync = true
  rootModel  = "User"
  exclude    = ["Changelog", "Session"]
}
```

### 3. Define Your Schema

```prisma
model User {
  id    String  @id @default(cuid())  // Client-generated IDs required for sync
  name  String
  email String  @unique
  
  todos Todo[]
}

model Todo {
  id    String  @id @default(cuid())
  title String
  done  Boolean @default(false)
  
  userId String
  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### 4. Generate & Use

Generate the client:

```bash
pnpm exec prisma generate
```

Use it in your code:

```typescript
import { PrismaIDBClient } from "./prisma-idb";

const client = await PrismaIDBClient.createClient();

// Create
await client.user.create({
  data: { name: "Alice", email: "alice@example.com" }
});

// Read
const todos = await client.todo.findMany({
  where: { userId: userId, done: false }
});

// Update
await client.todo.update({
  where: { id: todoId },
  data: { done: true }
});

// Delete
await client.todo.delete({
  where: { id: todoId }
});
```

## Installation

```bash
pnpm add @prisma-idb/idb-client-generator --save-dev
```

## Development Setup

This project uses pnpm workspaces and includes a devcontainer configuration for a consistent development environment.

### Using DevContainer (Recommended)

1. Open the project in VS Code
2. Install the "Dev Containers" extension if you haven't already
3. Click "Reopen in Container" when prompted, or use the command palette: `Dev Containers: Reopen in Container`
4. The container will automatically install dependencies using pnpm

### Local Development

If you prefer to develop locally:

1. Install pnpm: `corepack enable` (Node.js 16.13+) or `npm install -g pnpm`
2. Install dependencies: `pnpm install`
3. Run development server: `pnpm dev`
4. Run tests: `pnpm test`

## Usage

The API mimics Prisma Client's API for ease of use:

### `create`

Insert a new record:

```javascript
idbClient.modelName.create({
  data: {
    field: value,
  },
});
```

### `findMany`

Retrieve all records:

```javascript
idbClient.modelName.findMany();
```

### `findUnique`

Retrieve a single record by unique key:

```javascript
idbClient.modelName.findUnique({
  where: { key: value },
});
```

### `update`

Update a record:

```javascript
idbClient.modelName.update({
  where: { key: value },
  data: { key: newValue },
});
```

### `delete`

Delete a record:

```javascript
idbClient.modelName.delete({
  where: { key: value },
});
```

## Contributing

We welcome contributions! Please see our CONTRIBUTING.md for guidelines on how to contribute to this project.

## Security

If you discover a security vulnerability, please follow our SECURITY.md guidelines on reporting issues responsibly.

## License

This project is licensed under the GNU Affero General Public License v3.0. See the LICENSE file for more details.
