import type { RuntimeDriverInstance } from "@prisma-next/framework-components/execution";
import type { IdbPlanBody } from "./plan-body";

export class IdbRuntimeDriverInstance implements RuntimeDriverInstance<"idb", "idb"> {
  readonly familyId = "idb" as const;
  readonly targetId = "idb" as const;
  /**
   * The live IDBDatabase connection. Resolves once `upgradeneeded` (if any)
   * completes and the database is ready for use.
   *
   * The adapter awaits this inside `runDriver()` before opening transactions.
   * The Promise is shared — all concurrent callers get the same database object.
   */
  readonly db: Promise<IDBDatabase>;

  constructor(dbName: string, version: number) {
    this.db = openIdbDatabase(dbName, version);
  }

  async close(): Promise<void> {
    (await this.db).close();
  }

  /**
   * Execute an IDB plan body and yield rows as an async iterable.
   *
   * Phase 3 implements this: opens an IDB transaction on the object store(s)
   * referenced by `plan`, executes the plan (cursor scan / key-get / put /
   * delete / batch), and yields each result row.
   *
   * Called by `IdbRuntimeImpl.runDriver()` in `@prisma-next-idb/runtime-idb`.
   */
  execute(_plan: IdbPlanBody): AsyncIterable<Record<string, unknown>> {
    throw new Error("IDB execute not yet implemented — Phase 3");
  }
}

/**
 * Opens an IDB database and resolves once it is ready for use.
 *
 * Wraps the IDB event-based open API in a Promise. The `upgradeneeded`
 * handler is a no-op in Phase 2 — the IDBMigrationRunner (Phase 5) will
 * replace it.
 */
function openIdbDatabase(dbName: string, version: number): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(dbName, version);

    req.onerror = () => {
      reject(req.error);
    };

    req.onblocked = () => {
      reject(new Error(`IDB open blocked for "${dbName}": another connection is open with an older version.`));
    };

    // Phase 5 — IDBMigrationRunner will hook here to create / drop object stores.
    req.onupgradeneeded = handleUpgradeNeeded;

    req.onsuccess = () => {
      resolve(req.result);
    };
  });
}

/**
 * No-op upgrade handler for Phase 2.
 *
 * Phase 5 replaces this with the full IDBMigrationRunner which diffs the
 * manifest and runs DDL ops (createObjectStore, createIndex, etc.) inside
 * the version-change transaction provided here.
 */
function handleUpgradeNeeded(_event: IDBVersionChangeEvent): void {
  // No-op. DDL is Phase 5.
}
