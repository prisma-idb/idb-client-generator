import { createAutoMigratingIdbClient } from "@prisma-next-idb/client-idb/client-auto";
import type { IdbContract } from "@prisma-next-idb/client-idb/orm";
import type { ManifestLike } from "@prisma-next-idb/client-idb/client-auto";

const DB_NAME = "prisma-next-usage";

let _client: Awaited<ReturnType<typeof createAutoMigratingIdbClient>> | null = null;

/**
 * Returns the singleton IDB client, running migrations first if needed.
 *
 * Pass `manifest` when the server can provide `prisma-idb.manifest.json`
 * (e.g. via a page loader). When omitted, the runtime probes the live
 * database to discover the current version.
 */
export async function getDb(contract: IdbContract, manifest?: ManifestLike) {
  if (!_client) {
    _client = await createAutoMigratingIdbClient({ contract, dbName: DB_NAME, manifest });
  }
  return _client;
}
