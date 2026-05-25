import { defineConfig } from "@prisma-next-idb/family-idb/config-types";
import { typescriptContract } from "@prisma-next-idb/family-idb/config-types";
import idbFamily, { IdbManifestControlDriverDescriptor } from "@prisma-next-idb/family-idb/control";
import idbTarget from "@prisma-next-idb/target-idb/control";
import idbAdapter from "@prisma-next-idb/adapter-idb/control";
import { contract } from "./src/lib/prisma/contract.server";

/**
 * Prisma Next config for the IDB usage app.
 *
 * Enables the full CLI control plane:
 * ```bash
 * pnpm prisma-next db sign       # Write marker to manifest
 * pnpm prisma-next db verify     # Check marker against contract
 * pnpm prisma-next db update     # Plan + apply migration, bump idbVersion
 * pnpm prisma-next migration new # Scaffold a migration.ts file
 * ```
 *
 * The manifest driver reads/writes `prisma-idb.manifest.json` — the
 * on-disk record of the last-applied `idbVersion` and contract marker.
 */
export default defineConfig({
  family: idbFamily,
  target: idbTarget,
  adapter: idbAdapter,
  driver: IdbManifestControlDriverDescriptor,
  db: {
    connection: "./prisma-idb.manifest.json",
  },
  contract: typescriptContract(contract, "src/lib/prisma/contract.json"),
  migrations: {
    dir: "migrations",
  },
});
