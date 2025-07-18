# Prisma IndexedDB Client Generator

This library is a **Prisma generator** that creates a client with a similar syntax and behavior to the Prisma Client but is designed to operate with **IndexedDB** for local storage. It allows developers to interact with IndexedDB using a familiar Prisma-like API.

### 🔍 Demo

Check out the [Live Demo](https://prisma-idb.github.io/pidb-kanban-example/) to see **Prisma IDB** in action!

This demo showcases:

* ⚡ **Instant local storage** using `IndexedDB` — no backend needed
* 🔒 **Type-safe queries** powered by your **Prisma schema**
* 🌐 **Offline-first** — works without internet

Built with developers in mind: Fast, consistent, and schema-driven local data.

> 🧠 Ideal for PWAs, offline apps, and prototypes that need real data handling — instantly.

## ⚠️ Warning

This library is not fully ready yet. Check [issue #52](https://github.com/prisma-idb/idb-client-generator/issues/52) for the current list of implemented features.

## Features

- Prisma-like syntax and API for IndexedDB.
- Supports CRUD operations with structured data.
- Integrates seamlessly with Prisma workflows.
- Generates a client tailored to your Prisma schema.

## Installation

```bash
npm install @prisma-idb/idb-client-generator
```

## Usage

### 1. Add to Prisma Schema

Update your `prisma.schema` file to include the generator:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

generator prismaIDB {
  provider = "idb-client-generator"
  output   = "./prisma-idb"
}

model User {
  id    Int    @id @default(autoincrement())
  name  String
  email String @unique
}
```

### 2. Generate the Client

Run the Prisma client generation command:

```bash
npx prisma generate
```

This will generate a client in your project.

### 3. Use the Client

Import the generated client and use it in your code:

```typescript
import { PrismaIDBClient } from "./outputPath/prisma-idb-client";

async function main() {
  const idbClient = await PrismaIDBClient.createClient();

  await idbClient.user.create({
    data: { name: "Alice", email: "alice@example.com" },
  });

  const users = await idbClient.user.findMany();
  console.log(users);
}
```

## API

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

## Development Notes

- **IndexedDB Dependency**: The client internally uses the `idb` library for IndexedDB operations.
- **Compatibility**: Ensure your environment supports IndexedDB (modern browsers).
- **Local-Only**: This is designed for local storage scenarios and does not support server-side databases.

## Contributing
We welcome contributions! Please see our CONTRIBUTING.md for guidelines on how to contribute to this project.

## Security
If you discover a security vulnerability, please follow our SECURITY.md guidelines on reporting issues responsibly.

## License
This project is licensed under the GNU Affero General Public License v3.0. See the LICENSE file for more details.

## Acknowledgements
Special thanks to the open-source community for their contributions to the tools and libraries used in this project.
