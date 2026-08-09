import { idbSyncExtension } from "@prisma-next-idb/sync-extension-idb/control";
import { createAutoMigratingSyncIdbClient } from "@prisma-next-idb/sync-extension-idb/client";
import type { SyncIdbClient } from "@prisma-next-idb/sync-extension-idb/client";
import type { Contract } from "./contract";
import { contractSpace } from "./contract-space.generated";

const DB_NAME = "prisma-next-idb-kanban-example";

type DbClient = SyncIdbClient<Contract>;

let client: DbClient | null = null;
let clientPromise: Promise<DbClient> | null = null;

/** Migrate + open a sync-tracked client in one call — `db.orm.*` mutations atomically write outbox events alongside the model write. */
export async function getDb(): Promise<DbClient> {
  if (client) return client;
  clientPromise ??= createAutoMigratingSyncIdbClient<Contract>({
    contractSpace,
    dbName: DB_NAME,
    extensions: [idbSyncExtension],
  }).catch((err: unknown) => {
    // Clear on rejection so a later getDb() call retries instead of
    // re-awaiting the same rejected promise forever.
    clientPromise = null;
    throw err;
  });

  const fresh = await clientPromise;
  client = fresh;

  return fresh;
}

export async function closeDb(): Promise<void> {
  if (!client) return;
  await client.close();
  client = null;
  clientPromise = null;
}
