/// <reference types="node" />

import "dotenv/config";
import { definePrismaConfig } from "@prisma/cli-engine";
import { defineConfig } from "@prisma/orm-framework/config/config-types";
import postgresAdapter from "@prisma/orm-postgres/adapter/control";
import { PG_INT_CODEC_ID, PG_TEXT_CODEC_ID } from "@prisma/orm-postgres/target/codec-ids";
import postgresDriver from "@prisma/orm-postgres/driver/control";
import sql from "@prisma/orm-postgres/family/control";
import postgres from "@prisma/orm-postgres/target/control";
import postgresPackRef from "@prisma/orm-postgres/target/pack";
import { postgresCreateNamespace } from "@prisma/orm-postgres/target/types";
import { sqlContractWithSync } from "@prisma-next-idb/sync-server/schema";

/**
 * The kanban app's real server — SQL family, Postgres target. Wires
 * `@prisma/orm-postgres`'s family/target/adapter/driver descriptors through
 * the core `defineConfig` (`@prisma/orm-framework/config/config-types`)
 * directly, rather than `@prisma/orm-postgres/config`'s convenience
 * wrapper — that wrapper's `contract` option only accepts a schema *path*
 * (it builds its own internal `prismaContract()` call), so it can't take
 * `sqlContractWithSync`'s `ContractConfig` return value.
 * rc.5, unified `prisma.config.ts` naming, `@prisma/cli-engine` envelope.
 *
 * One schema, not two: `src/lib/prisma/schema.prisma` is the only
 * hand-authored source for User/Board/Todo/AuditLog — the same file
 * `prisma.config.ts` (IDB family, browser client) parses.
 * `sqlContractWithSync` (`@prisma-next-idb/sync-server/schema`) strips
 * `@idb.exclude`/`@@idb.exclude` (meaningless to a real server; the SQL
 * parser hard-errors on the unrecognized `idb` namespace otherwise) and
 * appends a SQL-flavored `Changelog` (real enum, real DB-generated id) —
 * entirely in memory, so no generated `.prisma` file lands in
 * `src/lib/prisma/`.
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
  orm: defineConfig({
    family: sql,
    target: postgres,
    adapter: postgresAdapter,
    driver: postgresDriver,
    // output is explicit: the default derives from the schema's own
    // directory (src/lib/prisma/contract.json), which would collide with
    // the IDB side's own contract.json living in the same directory.
    contract: sqlContractWithSync("src/lib/prisma/schema.prisma", {
      target: postgresPackRef,
      createNamespace: postgresCreateNamespace,
      enumInferenceCodecs: { text: PG_TEXT_CODEC_ID, int: PG_INT_CODEC_ID },
      output: "src/lib/prisma/schema.postgres.generated.json",
    }),
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
