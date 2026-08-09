import "dotenv/config";
import { defineConfig } from "@prisma-next/postgres/config";
import { writeSqlSchemaWithSync } from "@prisma-next-idb/sync-server/schema";

/**
 * The kanban app's real server — SQL family, Postgres target, via
 * `@prisma-next/postgres`'s batteries-included config (family-sql +
 * target-postgres + adapter-postgres + driver-postgres wired in already).
 *
 * One schema, not two: `src/lib/prisma/schema.prisma` is the only
 * hand-authored source for User/Board/Todo/AuditLog — the same file
 * `prisma-next.config.ts` (IDB family, browser client) parses.
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
 * Emit with: `prisma-next contract emit --config prisma-next.config.postgres.ts`
 * Create the schema with: `prisma-next db init --config prisma-next.config.postgres.ts`
 * Author a migration with: `prisma-next migration new --config prisma-next.config.postgres.ts`
 */
export default defineConfig({
  // No outputPath override — deriveOutputPath names it from the schema
  // filename (schema.postgres.generated.{json,d.ts}), which keeps it from
  // colliding with the IDB side's contract.json in the same
  // src/lib/prisma/ directory.
  contract: writeSqlSchemaWithSync("src/lib/prisma/schema.prisma", "src/lib/prisma/schema.postgres.generated.prisma"),
  db: {
    connection: process.env.DATABASE_URL,
  },
  // A distinct directory from the IDB side's `migrations/app/*` (the
  // `migrations: { dir: "migrations" }` default in prisma-next.config.ts) —
  // sharing one would make `migration new`/`db init` treat the two
  // completely unrelated migration lineages (browser IDB, real Postgres
  // server) as one graph, computing nonsense `from` hashes across families.
  migrations: {
    dir: "migrations-postgres",
  },
});
