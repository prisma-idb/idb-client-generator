import { defineConfig } from "@prisma-next-idb/family-idb/config-types";
import { typescriptContract } from "@prisma-next-idb/family-idb/config-types";
import idbFamily from "@prisma-next-idb/family-idb/control";
import idbTarget from "@prisma-next-idb/target-idb/control";
import idbAdapter from "@prisma-next-idb/adapter-idb/control";
import idbDriver from "@prisma-next-idb/driver-idb/control";
import { syncContract } from "./src/contract";

/**
 * Prisma Next config for the sync extension's contract space (ADR 212
 * contract-space package layout — `prisma-next.config.ts` at the package
 * root, per the convention every extension package follows).
 *
 * This wires the **framework-generic** CLI (`prisma-next contract emit`)
 * so `src/contract.json` + `src/contract.d.ts` are real emitted artifacts
 * instead of a live TS object imported directly — matching the ADR 212
 * package layout `src/exports/control.ts` JSON-imports from.
 *
 * The IDB-specific baseline/migration tooling (`prisma-next-idb
 * generate-baseline --space idb-sync`) reads `src/contract.json` produced
 * by this config's `contract emit`, not this file directly.
 *
 * As with the app usage example, the CLI's `db verify`/`db init`/`db update`
 * are refusal-only for IDB (no live IndexedDB on the Node side) — this
 * config exists for `contract emit`, not for applying migrations.
 */
export default defineConfig({
  family: idbFamily,
  target: idbTarget,
  adapter: idbAdapter,
  driver: idbDriver,
  db: {
    // Not used by IDB — the framework requires the field but `idbDriver`
    // ignores it.
    connection: ":memory:",
  },
  contract: typescriptContract(syncContract, "src/contract.json"),
  migrations: {
    dir: "migrations",
  },
});
