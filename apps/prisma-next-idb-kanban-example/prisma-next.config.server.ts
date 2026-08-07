import { defineConfig } from "@prisma-next-idb/family-idb/config-types";
import { prismaIdbContract } from "@prisma-next-idb/family-idb/contract-psl";
import idbFamily from "@prisma-next-idb/family-idb/control";
import idbTarget from "@prisma-next-idb/target-idb/control";
import idbAdapter from "@prisma-next-idb/adapter-idb/control";
import idbDriver from "@prisma-next-idb/driver-idb/control";

/**
 * The server/full counterpart to `prisma-next.config.ts` (ADR 012). This app
 * has no real backend, so nothing consumes `contract.server.json` at
 * runtime — it exists to demonstrate that the same `schema.prisma`, run
 * through `family-idb`'s interpreter a second time with `projection: "full"`,
 * emits `User.passwordHash` and `AuditLog` where the client contract omits
 * them. In a split-package app this config (or its `defineContract`
 * equivalent) would live in the shared schema package's server build step,
 * not in the frontend app — see ADR 012 § "Split-package apps".
 *
 * Emit with: `prisma-next contract emit --config prisma-next.config.server.ts`
 */
export default defineConfig({
  family: idbFamily,
  target: idbTarget,
  adapter: idbAdapter,
  driver: idbDriver,
  db: {
    connection: ":memory:", // unused by IDB; required by the framework
  },
  contract: prismaIdbContract("src/lib/prisma/schema.prisma", {
    projection: "full",
    output: "src/lib/prisma/contract.server.json",
  }),
  migrations: {
    dir: "migrations",
  },
});
