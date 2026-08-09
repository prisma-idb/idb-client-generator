import { createSyncServer } from "@prisma-next-idb/sync-server";
import type { GetKeyField } from "@prisma-next-idb/sync-server";
import { domainModelsAtDefaultNamespace } from "@prisma-next/contract/types";
import type { Contract as ClientContract } from "../prisma/contract";
import type { Contract as ServerContract } from "../prisma/schema.postgres.generated.d";
import clientContractJson from "../prisma/contract.json" with { type: "json" };
import serverContractJson from "../prisma/schema.postgres.generated.json" with { type: "json" };

export const serverContract = serverContractJson as unknown as ServerContract;

/**
 * SQL's primary key doesn't live where IDB's does (`sync-server`'s default
 * `getKeyField` duck-types `model.storage.keyPath`, which SQL contracts
 * don't have at all) — it's on the table definition, as a possibly-compound
 * array: `contract.storage.namespaces[ns].entries.table[table].primaryKey.columns`.
 * Every model this app syncs uses a single-field key, so a compound result
 * is a real limitation, not a silently-ignored one — nothing in
 * push/+server.ts or pull/+server.ts handles a composite `key`.
 */
export const sqlGetKeyField: GetKeyField = (contract, modelName) => {
  const model = domainModelsAtDefaultNamespace(contract.domain)[modelName];
  const storage = model?.storage as { table?: string; namespaceId?: string } | undefined;
  if (!storage?.table || !storage.namespaceId) {
    throw new Error(`Model "${modelName}" has no table/namespaceId in the contract's storage.`);
  }
  const table = (
    contract.storage as unknown as {
      namespaces: Record<string, { entries: { table: Record<string, { primaryKey: { columns: string[] } }> } }>;
    }
  ).namespaces[storage.namespaceId]?.entries.table[storage.table];
  const columns = table?.primaryKey?.columns;
  if (!columns || columns.length !== 1) {
    throw new Error(
      `Model "${modelName}" has no single-column primary key (got ${columns?.length ?? 0}) — ` +
        `compound keys aren't supported by this app's sync plumbing.`
    );
  }
  return columns[0]!;
};

export const syncServer = createSyncServer({
  contract: serverContract, // real Postgres contract (src/lib/server/db.ts) — no IDB-shaped stand-in
  clientContract: clientContractJson as unknown as ClientContract,
  rootModel: "User",
  getKeyField: sqlGetKeyField,
});
