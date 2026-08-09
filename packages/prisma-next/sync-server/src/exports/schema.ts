import type { ContractConfig } from "@prisma-next/config/config-types";
import type { PrismaIdbContractOptions } from "@prisma-next-idb/family-idb/contract-psl";
import { prismaIdbContract } from "@prisma-next-idb/family-idb/contract-psl";
import { injectChangelogModel } from "../core/changelog-schema";

/**
 * Plain PSL-text transform — appends the `Changelog` model (ADR 014's
 * push/pull log shape) to raw schema text, unparsed. Family-agnostic: it
 * only uses vanilla Prisma scalar types/attributes (`String`, `Json`,
 * `@id`, `@unique`, `@@index`), no `@idb.*`-namespaced syntax, so it isn't
 * tied to `family-idb` specifically. `prismaIdbContractWithSync` below is
 * what wires it into IDB's own PSL loader; a future SQL/Mongo family
 * package would wire this same function into *its* loader instead,
 * whatever that ends up looking like.
 */
export { injectChangelogModel };

/**
 * `family-idb`'s `prismaIdbContract`, with `injectChangelogModel` wired in
 * as the pre-parse hook — i.e. this is IDB-family-specific, not a generic
 * "add Changelog to your server" helper. It only makes sense when the
 * *server* is itself backed by the IDB family — which today means this
 * repo's own kanban-example pattern (no real backend; `family-idb`'s
 * interpreter run a second time with `projection: "full"` stands in for
 * one). If your server is a real Postgres/Mongo database, this function
 * doesn't apply — there's no SQL/Mongo family package in this repo (yet).
 * What carries over once one exists is the pattern, not this function:
 * that family's own PSL/contract loader would need the same kind of
 * pre-parse `injectSchemaText` hook `family-idb`'s `prismaIdbContract`
 * has, and could reuse `injectChangelogModel` directly against it.
 *
 * Use for the *server* config only (`projection: "full"`, or omitted) —
 * never wire it into the client config, or the client contract would gain
 * a model it can never legitimately have data for.
 *
 * @example
 * ```ts
 * import { defineConfig } from '@prisma-next-idb/family-idb/config-types';
 * import { prismaIdbContractWithSync } from '@prisma-next-idb/sync-server/schema';
 *
 * export default defineConfig({
 *   // ...
 *   contract: prismaIdbContractWithSync('./src/prisma/schema.prisma', {
 *     projection: 'full',
 *     output: './src/prisma/contract.server.json',
 *   }),
 * });
 * ```
 */
export function prismaIdbContractWithSync(schemaPath: string, options?: PrismaIdbContractOptions): ContractConfig {
  return prismaIdbContract(schemaPath, { ...options, injectSchemaText: injectChangelogModel });
}
