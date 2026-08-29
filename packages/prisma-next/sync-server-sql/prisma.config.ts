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
 * Test-only fixture config — a real Postgres contract this package's own
 * integration suite (test/sql-sync-adapter.test.ts) runs against, in place
 * of the in-memory ORM fake this package used to carry. `sqlContractWithSync`
 * applies the sync-schema transform (strip `@idb.exclude`, append the
 * synthetic `Changelog` model) to test/fixtures/schema.prisma entirely in
 * memory — no `.generated.prisma` file lands on disk.
 *
 * `defineConfig` here is the core one (`@prisma/orm-framework/config/config-types`),
 * not `@prisma/orm-postgres/config`'s convenience wrapper — that wrapper's
 * `contract` option only accepts a schema *path* (it builds its own internal
 * `prismaContract()` call), so it can't take `sqlContractWithSync`'s
 * `ContractConfig` return value. Wiring `family`/`target`/`adapter`/`driver`
 * by hand is the tradeoff for skipping the intermediate file.
 *
 * `definePrismaConfig` (the rc.4-era `@prisma/cli-engine` envelope, not the
 * deprecated `defineConfig` alias some vendor examples still use) nests the
 * ORM section under the `orm` key, matching the shape `ormCommandFamily`
 * (the generic, family-agnostic `contract emit`/`db init`/etc. commands)
 * expects.
 *
 * Emit with: `pnpm contract:emit:postgres`
 * Create the schema with: `pnpm db:init`
 */
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set — point it at a reachable Postgres (see .env.example) before running tests."
  );
}

export default definePrismaConfig({
  orm: defineConfig({
    family: sql,
    target: postgres,
    adapter: postgresAdapter,
    driver: postgresDriver,
    contract: sqlContractWithSync("test/fixtures/schema.prisma", {
      target: postgresPackRef,
      createNamespace: postgresCreateNamespace,
      enumInferenceCodecs: { text: PG_TEXT_CODEC_ID, int: PG_INT_CODEC_ID },
      // Matches the old file-based path's derived name (schema.generated.prisma
      // → schema.generated.json) — test/helpers.ts imports this filename
      // directly, and the default here would otherwise derive `contract.json`
      // from the source schema's own name instead.
      output: "test/fixtures/schema.generated.json",
    }),
    db: {
      connection: process.env.DATABASE_URL,
    },
    migrations: {
      dir: "test/fixtures/migrations-postgres",
    },
  }),
});
