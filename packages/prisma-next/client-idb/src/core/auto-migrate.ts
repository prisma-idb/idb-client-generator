import type { IdbContract } from "./types";
import {
  IdbMigrationControlDriverDescriptor,
  IdbMigrationPlanner,
  IdbMigrationRunner,
} from "@prisma-next-idb/target-idb/migration";
import { createIdbClient, type IdbClient } from "./idb-client";

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Minimal manifest shape needed by the auto-migration client.
 *
 * Accepts any object with an optional `idbVersion` property (number).
 * Compatible with {@link import('@prisma-next-idb/family-idb/control').IdbManifest}
 * without requiring a direct dependency on the family-idb package.
 */
export type ManifestLike = { readonly idbVersion?: number } | null | undefined;

/**
 * Options for {@link createAutoMigratingIdbClient}.
 */
export interface AutoMigrateClientOptions<TContract extends IdbContract> {
  readonly contract: TContract;
  readonly dbName: string;
  /**
   * Optional manifest loaded server-side from `prisma-idb.manifest.json`.
   * When provided, `manifest.idbVersion` drives the `targetVersion`
   * computation. When omitted, the runtime probes the live database.
   */
  readonly manifest?: ManifestLike;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Migration policy for the browser runtime.
 *
 * All operation classes are allowed — there is no separate deploy step
 * where a human reviews destructive changes. The browser is a single-user,
 * client-local database.
 */
const ALLOW_ALL = {
  allowedOperationClasses: ["additive", "widening", "destructive", "data"] as const,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStorageHash(contract: IdbContract): string | null {
  const c = contract as unknown as Record<string, unknown>;
  const storage = c["storage"];
  if (!storage || typeof storage !== "object") return null;
  const hash = (storage as Record<string, unknown>)["storageHash"];
  return typeof hash === "string" ? hash : null;
}

type IntrospectedStore = {
  keyPath: string;
  autoIncrement?: boolean;
  indexes?: Record<string, { keyPath: string; unique: boolean; multiEntry?: boolean }>;
};

function introspectLiveDb(
  dbName: string,
  factory: IDBFactory
): Promise<{ version: number; markerHash: string | null; stores: Record<string, IntrospectedStore> }> {
  return new Promise((resolve) => {
    const req = factory.open(dbName);
    req.onsuccess = () => {
      const db = req.result;
      const version = db.version;
      const storeNames = Array.from(db.objectStoreNames).filter((n) => n !== "_prisma_next_marker");

      // Empty DB (no user stores) → no introspection needed.
      if (storeNames.length === 0) {
        const hasMarker = db.objectStoreNames.contains("_prisma_next_marker");
        if (!hasMarker) {
          db.close();
          resolve({ version, markerHash: null, stores: {} });
          return;
        }
        const tx = db.transaction("_prisma_next_marker", "readonly");
        const markerReq = tx.objectStore("_prisma_next_marker").get("default");
        markerReq.onsuccess = () => {
          const record = markerReq.result as { storageHash?: string } | undefined;
          db.close();
          resolve({ version, markerHash: record?.storageHash ?? null, stores: {} });
        };
        markerReq.onerror = () => {
          db.close();
          resolve({ version, markerHash: null, stores: {} });
        };
        return;
      }

      // Read marker + introspect user stores in one transaction.
      const txStores = db.objectStoreNames.contains("_prisma_next_marker")
        ? ["_prisma_next_marker", ...storeNames]
        : storeNames;
      const tx = db.transaction(txStores, "readonly");

      const stores: Record<string, IntrospectedStore> = {};
      for (const storeName of storeNames) {
        const store = tx.objectStore(storeName);
        const keyPath = typeof store.keyPath === "string" ? store.keyPath : "id";
        const indexes: Record<string, { keyPath: string; unique: boolean; multiEntry?: boolean }> = {};
        for (const indexName of Array.from(store.indexNames)) {
          const idx = store.index(indexName);
          const idxKeyPath = typeof idx.keyPath === "string" ? idx.keyPath : String(idx.keyPath);
          indexes[indexName] = {
            keyPath: idxKeyPath,
            unique: idx.unique,
            ...(idx.multiEntry ? { multiEntry: true } : {}),
          };
        }
        stores[storeName] = {
          keyPath,
          ...(store.autoIncrement ? { autoIncrement: true } : {}),
          ...(Object.keys(indexes).length > 0 ? { indexes } : {}),
        };
      }

      let markerHash: string | null = null;
      if (db.objectStoreNames.contains("_prisma_next_marker")) {
        const markerReq = tx.objectStore("_prisma_next_marker").get("default");
        markerReq.onsuccess = () => {
          const record = markerReq.result as { storageHash?: string } | undefined;
          markerHash = record?.storageHash ?? null;
        };
      }

      tx.oncomplete = () => {
        db.close();
        resolve({ version, markerHash, stores });
      };
      tx.onerror = () => {
        db.close();
        resolve({ version, markerHash: null, stores });
      };
    };
    req.onerror = () => {
      resolve({ version: 0, markerHash: null, stores: {} });
    };
  });
}

// ── Migration ─────────────────────────────────────────────────────────────────

/**
 * Runs the IDB migration if the marker does not match the contract.
 *
 * Per ADR 001: two-phase approach — DDL in `upgradeneeded`, marker write
 * in a separate `readwrite` transaction.
 *
 * @internal Exported for testing; prefer {@link createAutoMigratingIdbClient}.
 */
export async function autoMigrate(
  contract: IdbContract,
  dbName: string,
  factory: IDBFactory,
  manifest?: ManifestLike
): Promise<void> {
  const targetHash = getStorageHash(contract);
  if (!targetHash) return;

  const { version: currentVersion, markerHash, stores: existingStores } = await introspectLiveDb(dbName, factory);
  if (markerHash === targetHash) return;

  const baseVersion = manifest?.idbVersion ?? currentVersion;
  const targetVersion = baseVersion + 1;

  // Build a synthetic "fromContract" from the live DB schema so the planner
  // produces a delta plan (add/drop), not a from-scratch plan.
  // The planner only reads `contract.storage.stores`; the other fields can
  // be stubs. When the live DB is empty, pass `null` to trigger the
  // first-migration path (creates the marker store).
  const hasExistingSchema = Object.keys(existingStores).length > 0 || markerHash !== null;
  const fromContract = hasExistingSchema
    ? ({
        storage: { stores: existingStores, storageHash: markerHash ?? "unknown" },
      } as unknown as Parameters<typeof IdbMigrationPlanner.prototype.plan>[0]["fromContract"])
    : null;

  const planner = new IdbMigrationPlanner();
  const planResult = planner.plan({
    contract: contract as unknown,
    schema: null,
    policy: ALLOW_ALL,
    fromContract,
    frameworkComponents: [],
    spaceId: "app",
  });

  if (planResult.kind === "failure") {
    throw new Error(planResult.conflicts.map((c) => c.summary).join("; "));
  }

  if (planResult.plan.operations.length === 0) return;

  const driver = IdbMigrationControlDriverDescriptor.create({
    dbName,
    factory,
    targetVersion,
  });

  const result = await new IdbMigrationRunner().execute({
    plan: planResult.plan,
    driver,
    destinationContract: contract as unknown,
    policy: ALLOW_ALL,
    frameworkComponents: [],
  });

  if (!result.ok) {
    throw new Error(`IDB migration failed: ${result.failure.summary}`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Creates a typed IDB client with automatic migration.
 *
 * Before opening the client, runs the migration planner and runner to ensure
 * the database schema matches the contract. This is the **canonical** way to
 * initialize a browser-side IDB database with Prisma Next IDB.
 *
 * @example
 * ```ts
 * import { createAutoMigratingIdbClient } from '@prisma-next-idb/client-idb/client-auto';
 * import { contract } from './contract.server';
 *
 * // Client-only (probes live database for current version):
 * const db = await createAutoMigratingIdbClient({ contract, dbName: 'my-app' });
 *
 * // SSR-aware (manifest loaded server-side):
 * import manifest from '../prisma-idb.manifest.json' with { type: 'json' };
 * const db = await createAutoMigratingIdbClient({ contract, dbName: 'my-app', manifest });
 *
 * // Querying:
 * const users = await db.orm.users.all().toArray();
 * ```
 */
export async function createAutoMigratingIdbClient<TContract extends IdbContract>(
  options: AutoMigrateClientOptions<TContract>
): Promise<IdbClient<TContract>> {
  await autoMigrate(options.contract, options.dbName, indexedDB, options.manifest);
  return createIdbClient({ contract: options.contract, dbName: options.dbName });
}
