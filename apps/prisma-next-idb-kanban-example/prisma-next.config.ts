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
  contract: prismaIdbContract("src/lib/prisma/schema.prisma"),
  migrations: {
    dir: "migrations",
  },
});
