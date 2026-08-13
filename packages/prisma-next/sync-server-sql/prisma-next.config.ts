/// <reference types="node" />

import "dotenv/config";
import { defineConfig } from "@prisma-next/postgres/config";
import { writeSqlSchemaWithSync } from "@prisma-next-idb/sync-server/schema";

/**
 * Test-only fixture config — a real Postgres contract this package's own
 * integration suite (test/sql-sync-adapter.test.ts) runs against, in place
 * of the in-memory ORM fake this package used to carry. `writeSqlSchemaWithSync`
 * appends the synthetic sync `Changelog` model to test/fixtures/schema.prisma,
 * the same way a real consuming app's prisma-next.config.postgres.ts does
 * (see apps/prisma-next-idb-kanban-example's, which this mirrors). The
 * generated file is gitignored — fully derived, regenerated on every load.
 *
 * Emit with: `pnpm contract:emit:postgres`
 * Create the schema with: `pnpm db:init`
 */
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set — point it at a reachable Postgres (see .env.example) before running tests."
  );
}

export default defineConfig({
  contract: writeSqlSchemaWithSync("test/fixtures/schema.prisma", "test/fixtures/schema.generated.prisma"),
  db: {
    connection: process.env.DATABASE_URL,
  },
  migrations: {
    dir: "test/fixtures/migrations-postgres",
  },
});
