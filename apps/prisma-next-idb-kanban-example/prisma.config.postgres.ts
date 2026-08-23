/// <reference types="node" />

import "dotenv/config";
import { definePrismaConfig } from "@prisma/cli-engine";
import { defineConfig as ormConfig } from "@prisma/orm-postgres/config";
import { writeSqlSchemaWithSync } from "@prisma-next-idb/sync-server/schema";

/**
 * The kanban app's real server — SQL family, Postgres target, via
 * `@prisma/orm-postgres`'s batteries-included config (family-sql +
 * target-postgres + adapter-postgres + driver-postgres wired in already).
 * rc.5, unified `prisma.config.ts` naming, `@prisma/cli-engine` envelope.
 *
 * One schema, not two: `src/lib/prisma/schema.prisma` is the only
 * hand-authored source for User/Board/Todo/AuditLog — the same file
 * `prisma.config.ts` (IDB family, browser client) parses.
 * `writeSqlSchemaWithSync` (`@prisma-next-idb/sync-server/schema`) turns it
 * into something the SQL family can parse — strips `@idb.exclude`/
 * `@@idb.exclude` (meaningless to a real server; the SQL parser hard-errors
 * on the unrecognized `idb` namespace otherwise) and appends a
 * SQL-flavored `Changelog` (real enum, real DB-generated id) — see that
 * function's own docs for the full reasoning. The generated file is
 * gitignored — it's fully derived, regenerated every config load.
 *
 * `createSyncServer` (`src/lib/server/sync.ts`) reads this contract
 * directly as its ownership-DAG source too — no separate IDB-shaped "full"
 * config exists just to feed it (ADR 014's "Genuinely family-agnostic").
 *
 * Emit with: `pnpm contract:emit:postgres` (now the real `prisma` binary).
 * Create the schema with: `pnpm db:init`
 * Author a migration with: `pnpm migration:postgres:new`
 */
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set — copy .env.example to .env and run `pnpm db:up && pnpm db:init`.");
}

export default definePrismaConfig({
  orm: ormConfig({
    // No outputPath override — deriveOutputPath names it from the schema
    // filename (schema.postgres.generated.{json,d.ts}), which keeps it from
    // colliding with the IDB side's contract.json in the same
    // src/lib/prisma/ directory.
    contract: writeSqlSchemaWithSync("src/lib/prisma/schema.prisma", "src/lib/prisma/schema.postgres.generated.prisma"),
    db: {
      connection: process.env.DATABASE_URL,
    },
    // A distinct directory from the IDB side's `migrations/app/*` (the
    // `migrations: { dir: "migrations" }` default in prisma.config.ts) —
    // sharing one would make `migration new`/`db init` treat the two
    // completely unrelated migration lineages (browser IDB, real Postgres
    // server) as one graph, computing nonsense `from` hashes across families.
    migrations: {
      dir: "migrations-postgres",
    },
  }),
});
