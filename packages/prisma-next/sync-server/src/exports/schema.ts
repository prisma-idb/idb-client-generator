import { injectChangelogModelSql, prepareSqlSchemaWithSync } from "../core/changelog-schema";
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
 * There's no `injectSchemaText`-style hook on the SQL family's own schema
 * loader (`@prisma/orm-family-sql`'s `prismaContract`, which
 * `@prisma/orm-postgres/config`'s `defineConfig` wraps) to plug this into
 * directly — so this still writes an intermediate file. This wrapper
 * exists so a consuming app's config doesn't have to know that; it just
 * calls one function.
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
