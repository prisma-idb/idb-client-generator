import { createAutoMigratingIdbClient } from "@prisma-next-idb/client-idb/client-auto";
import { contractSpace } from "./contract-space.generated";

const DEFAULT_DB_NAME = "prisma-next-usage";

type IdbClient = Awaited<ReturnType<typeof createAutoMigratingIdbClient>>;

let _client: IdbClient | null = null;
let _clientDbName: string | null = null;

/**
 * Resolve the IDB database name to use for the current page load.
 *
 * Reads `?db=<name>` from the URL when available so each Playwright spec
 * can isolate its own database; falls back to a constant for the
 * interactive UI.
 */
export function resolveDbName(): string {
  if (typeof window === "undefined") return DEFAULT_DB_NAME;
  const param = new URLSearchParams(window.location.search).get("db");
  return param && param.length > 0 ? param : DEFAULT_DB_NAME;
}

/**
 * Returns the singleton IDB client for the resolved `dbName`, running
 * the auto-migration on first use. Caches by db name so the same page
 * load can switch databases via reset() below.
 */
export async function getDb(): Promise<IdbClient> {
  const dbName = resolveDbName();
  if (_client && _clientDbName === dbName) return _client;
  if (_client) await _client.close();
  _client = await createAutoMigratingIdbClient({ contractSpace, dbName });
  _clientDbName = dbName;
  return _client;
}

/**
 * Close the cached client (if any) and delete the IDB database from
 * `window.indexedDB`. Used by the "Reset DB" control in the UI and by
 * Playwright specs that need a guaranteed-clean slate.
 *
 * Returns once `IDBFactory.deleteDatabase` resolves; rejects with the
 * underlying error event if delete fails.
 */
export async function resetDb(): Promise<void> {
  const dbName = resolveDbName();
  if (_client) {
    await _client.close();
    _client = null;
    _clientDbName = null;
  }
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(dbName);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error(`deleteDatabase("${dbName}") failed`));
    req.onblocked = () => reject(new Error(`deleteDatabase("${dbName}") blocked by an open connection`));
  });
}
