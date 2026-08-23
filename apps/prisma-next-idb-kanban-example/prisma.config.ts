import { definePrismaConfig } from "@prisma/cli-engine";
import { defineConfig as ormConfig } from "@prisma-next-idb/family-idb/config-types";
import { prismaIdbContract } from "@prisma-next-idb/family-idb/contract-psl";
import idbFamily from "@prisma-next-idb/family-idb/control";
import idbTarget from "@prisma-next-idb/target-idb/control";
import idbAdapter from "@prisma-next-idb/adapter-idb/control";
import idbDriver from "@prisma-next-idb/driver-idb/control";

/**
 * IDB side of this dual-stack example (rc.5, `prisma.config.ts` unified
 * naming — see PLAN_8.6.1). The Postgres side
 * (`prisma-next.config.postgres.ts`) is Tier 2, still frozen on the old
 * `@prisma-next/*@^0.16.0` stack and its own `prisma-next` bin — untouched
 * here, on purpose (see `PLAN_8.5_cli_config_unification.md` §0).
 *
 * This app is the browser client, so its own emitted contract is the
 * projected one — server-only members (`@idb.exclude`/`@@idb.exclude`,
 * e.g. `User.passwordHash`, `AuditLog`) never reach the bundle. See ADR
 * 012 and `prisma-next.config.postgres.ts` (the real server, which parses
 * this same schema.prisma through the SQL family instead).
 *
 * Emit with: `pnpm contract:emit` (now the real `prisma` binary, not the
 * dead `prisma-next` one). Plan/bundle/preflight migrations with
 * `prisma-next-idb migration ...` (Phase 8.6's shell), unchanged.
 */
export default definePrismaConfig({
  orm: ormConfig({
    family: idbFamily,
    target: idbTarget,
    adapter: idbAdapter,
    driver: idbDriver,
    db: {
      connection: ":memory:", // unused by IDB; required by the framework
    },
    contract: prismaIdbContract("src/lib/prisma/schema.prisma", { projection: "client" }),
    migrations: {
      dir: "migrations",
    },
  }),
});
