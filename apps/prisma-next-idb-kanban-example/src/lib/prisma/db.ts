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

/**
 * Closes and wipes the local database — used on logout so a different
 * account signing in on the same browser never sees a previous session's
 * boards/todos. `onblocked` (another tab still has the DB open) resolves
 * anyway: best-effort, matching `close()`'s own no-throw posture.
 */
export async function resetDb(): Promise<void> {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error as Error);
    req.onblocked = () => resolve();
  });
}
