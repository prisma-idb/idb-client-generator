import { defineConfig } from "@prisma-next-idb/family-idb/config-types";
import { prismaIdbContract } from "@prisma-next-idb/family-idb/contract-psl";
import idbFamily from "@prisma-next-idb/family-idb/control";
import idbTarget from "@prisma-next-idb/target-idb/control";
import idbAdapter from "@prisma-next-idb/adapter-idb/control";
import idbDriver from "@prisma-next-idb/driver-idb/control";

export default defineConfig({
  family: idbFamily,
  target: idbTarget,
  adapter: idbAdapter,
  driver: idbDriver,
  db: {
    connection: ":memory:", // unused by IDB; required by the framework
  },
  // This app is the browser client, so its own emitted contract is the
  // projected one — server-only members (`@idb.exclude`/`@@idb.exclude`,
  // e.g. `User.passwordHash`, `AuditLog`) never reach the bundle. See ADR
  // 012 and prisma-next.config.postgres.ts (the real server, which parses
  // this same schema.prisma through the SQL family instead — see that
  // file's header for why it's not "projection: full" through this same
  // IDB family the way it used to be).
  contract: prismaIdbContract("src/lib/prisma/schema.prisma", { projection: "client" }),
  migrations: {
    dir: "migrations",
  },
});
