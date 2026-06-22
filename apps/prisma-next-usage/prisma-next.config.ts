import { defineConfig } from "@prisma-next-idb/family-idb/config-types";
import { typescriptContract } from "@prisma-next-idb/family-idb/config-types";
import idbFamily from "@prisma-next-idb/family-idb/control";
import idbTarget from "@prisma-next-idb/target-idb/control";
import idbAdapter from "@prisma-next-idb/adapter-idb/control";
import idbDriver from "@prisma-next-idb/driver-idb/control";
import { contract } from "./src/lib/prisma/contract.server";

/**
 * Prisma Next config for the IDB usage app.
 *
 * IndexedDB is a browser API, so the CLI control plane is **refusal-only**:
 *
 * ```bash
 * pnpm prisma-next contract emit                    # Generates contract.json + .d.ts
 * pnpm prisma-next migration new                    # Scaffolds a migration.ts file
 * pnpm prisma-next-idb generate-baseline            # Auto-creates the first migration
 * pnpm prisma-next-idb generate-contract-space      # Bundles into contract-space.generated.ts
 * pnpm prisma-next-idb preflight                    # Validates the chain against fake-indexeddb
 * ```
 *
 * Migrations actually apply in the browser via `createAutoMigratingIdbClient`
 * (see `src/lib/prisma/db.ts`). The CLI's `db verify`/`db init`/`db update`
 * return `IDB-CLI-UNSUPPORTED` envelopes — there is no live IndexedDB on the
 * Node side. The framework still requires a `driver` value in the config;
 * `idbDriver` is a no-op stub that satisfies the type without touching IDB.
 */
export default defineConfig({
  family: idbFamily,
  target: idbTarget,
  adapter: idbAdapter,
  driver: idbDriver,
  db: {
    // Not used by IDB — the framework requires the field but `idbDriver`
    // ignores it. The browser app reads the database name from
    // `src/lib/prisma/db.ts`'s `resolveDbName()` instead.
    connection: ":memory:",
  },
  contract: typescriptContract(contract, "src/lib/prisma/contract.json"),
  migrations: {
    dir: "migrations",
  },
});
