import { injectChangelogModelSql, prepareSqlSchemaWithSync } from "../core/changelog-schema";
import { sqlContractWithSync } from "../core/sql-contract";
import { writeSqlSchemaWithSync } from "../core/write-sql-schema";

/**
 * Plain PSL-text transform — appends the `Changelog` model (ADR 014's
 * push/pull log shape: real enum, real DB-generated `autoincrement()` id)
 * to raw schema text, unparsed. Doesn't strip `@idb.exclude` — pair with
 * `@prisma-next-idb/family-idb/contract-psl`'s `stripIdbExcludeAttributes`
 * if the schema you're appending to was authored for family-idb, or use
 * {@link prepareSqlSchemaWithSync}, which already does both.
 */
export { injectChangelogModelSql };

/**
 * `stripIdbExcludeAttributes` (family-idb's `idb.exclude` namespace is
 * meaningless to a real server, and the SQL parser hard-errors on it) then
 * `injectChangelogModelSql` — the one call a SQL-family config needs to
 * turn a schema authored for family-idb into the real server schema.
 * Pure text in, text out — no file I/O. See {@link writeSqlSchemaWithSync}
 * for the version that also handles reading the source file and writing
 * the result, which is what a `defineConfig` call almost always wants.
 */
export { prepareSqlSchemaWithSync };

/**
 * The file-I/O wrapper around {@link prepareSqlSchemaWithSync}: reads
 * `sourceSchemaPath`, prepares it, writes the result to
 * `generatedSchemaPath` (with an auto-generated header), and returns
 * `generatedSchemaPath` so it can be used inline as `defineConfig`'s
 * `contract:` value.
 *
 * Needed because `@prisma/orm-postgres/config`'s `defineConfig` (and its
 * per-target siblings) only accept a schema *path* for `contract` — they
 * build their own `prismaContract(...)` call internally, so there's
 * nothing to hand a `ContractConfig` to. If you're wiring the core
 * `defineConfig` yourself instead of a target's convenience wrapper, use
 * {@link sqlContractWithSync}, which skips this intermediate file
 * entirely.
 *
 * @example
 * ```ts
 * import { defineConfig } from "@prisma/orm-postgres/config";
 * import { writeSqlSchemaWithSync } from "@prisma-next-idb/sync-server/schema";
 *
 * export default defineConfig({
 *   contract: writeSqlSchemaWithSync(
 *     "src/lib/prisma/schema.prisma",
 *     "src/lib/prisma/schema.postgres.generated.prisma"
 *   ),
 *   db: { connection: process.env.DATABASE_URL },
 * });
 * ```
 */
export { writeSqlSchemaWithSync };

/**
 * The file-free counterpart to {@link writeSqlSchemaWithSync}: reads the
 * source schema once, runs it through {@link prepareSqlSchemaWithSync} in
 * memory, and returns a `ContractConfig` directly — no generated
 * `.prisma` file lands on disk. Use this when wiring the core
 * `defineConfig` (`@prisma/orm-framework/config/config-types`) yourself;
 * a target's own convenience `defineConfig` (e.g.
 * `@prisma/orm-postgres/config`) only accepts a path for `contract`, so
 * it can't take this return value directly.
 *
 * @example
 * ```ts
 * import { definePrismaConfig } from "@prisma/cli-engine";
 * import { defineConfig } from "@prisma/orm-framework/config/config-types";
 * import postgres from "@prisma/orm-postgres/target/control";
 * import postgresAdapter from "@prisma/orm-postgres/adapter/control";
 * import postgresDriver from "@prisma/orm-postgres/driver/control";
 * import sql from "@prisma/orm-postgres/family/control";
 * import postgresPackRef from "@prisma/orm-postgres/target/pack";
 * import { postgresCreateNamespace } from "@prisma/orm-postgres/target/types";
 * import { sqlContractWithSync } from "@prisma-next-idb/sync-server/schema";
 *
 * export default definePrismaConfig({
 *   orm: defineConfig({
 *     family: sql,
 *     target: postgres,
 *     adapter: postgresAdapter,
 *     driver: postgresDriver,
 *     contract: sqlContractWithSync("src/lib/prisma/schema.prisma", {
 *       target: postgresPackRef,
 *       createNamespace: postgresCreateNamespace,
 *     }),
 *     db: { connection: process.env.DATABASE_URL },
 *   }),
 * });
 * ```
 */
export { sqlContractWithSync };
