import { createIdbClient } from "@prisma-next-idb/client-idb/client";
import type { IdbContract } from "@prisma-next-idb/client-idb/orm";
import {
  IdbMigrationControlDriverDescriptor,
  IdbMigrationPlanner,
  IdbMigrationRunner,
} from "@prisma-next-idb/target-idb/migration";
import type { IdbManifest } from "@prisma-next-idb/family-idb/control";

// ── Constants ─────────────────────────────────────────────────────────────────

const DB_NAME = "prisma-next-usage";

/**
 * Migration policy for the browser runtime.
 *
 * In the browser, all operation classes are allowed because there is no
 * separate deploy step where a human reviews destructive changes. The
 * browser is a single-user, client-local database — data loss from a
 * destructive migration is bounded to that user's session.
 *
 * The CLI (`prisma-next db update`) may use a stricter policy.
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

/**
 * Reads the current marker from the IDB database.
 *
 * Opens the database at its current version in a read-only transaction
 * to check whether the `_prisma_next_marker` store exists and whether
 * its `storageHash` matches the contract. This is the runtime equivalent
 * of `family.verify()` — it does NOT introspect the full schema, only
 * the marker.
 *
 * Returns `{ version: 0, markerHash: null }` when the database does not
 * exist yet (first run — `indexedDB.open()` fires `onerror` with
 * `version=0` semantics).
 */
function readCurrentMarker(): Promise<{ version: number; markerHash: string | null }> {
  return new Promise((resolve) => {
    const req = indexedDB.open(DB_NAME);
    req.onsuccess = () => {
      const db = req.result;
      const version = db.version;
      if (!db.objectStoreNames.contains("_prisma_next_marker")) {
        db.close();
        resolve({ version, markerHash: null });
        return;
      }
      const tx = db.transaction("_prisma_next_marker", "readonly");
      const markerReq = tx.objectStore("_prisma_next_marker").get("default");
      markerReq.onsuccess = () => {
        const record = markerReq.result as { storageHash?: string } | undefined;
        db.close();
        resolve({ version, markerHash: record?.storageHash ?? null });
      };
      markerReq.onerror = () => {
        db.close();
        resolve({ version, markerHash: null });
      };
    };
    req.onerror = () => {
      // Database does not exist yet — version 0, no marker
      resolve({ version: 0, markerHash: null });
    };
  });
}

// ── Manifest-aware migration ──────────────────────────────────────────────────

/**
 * Runs the IDB migration if the marker does not match the contract.
 *
 * Per ADR 001, the migration uses a two-phase approach:
 * 1. **DDL** inside `upgradeneeded` (IDB's version-change transaction)
 * 2. **Marker write** in a separate `readwrite` transaction after DDL commits
 *
 * The `targetVersion` is computed from `manifest.idbVersion` when available
 * (CLI-managed path), falling back to the live database version (runtime-only
 * path without a manifest).
 *
 * After a successful migration the marker store contains the new
 * `storageHash`. The runtime's `verifyMarker()` gates all queries on this
 * hash matching the contract. The caller (CLI) is responsible for writing
 * the bumped `idbVersion` back to the manifest — the browser runtime
 * never writes the manifest (ADR 001).
 *
 * @param contract - The typed IDB contract defining the desired schema.
 * @param manifest - Optional manifest loaded server-side from
 *   `prisma-idb.manifest.json`. When provided, `manifest.idbVersion`
 *   drives the `targetVersion` computation.
 */
async function migrate(contract: IdbContract, manifest?: IdbManifest | null): Promise<void> {
  const targetHash = getStorageHash(contract);
  if (!targetHash) return;

  // Read current state from the live database
  const { version: currentVersion, markerHash } = await readCurrentMarker();

  // Marker already matches — no migration needed
  if (markerHash === targetHash) return;

  // Compute the IDB version to upgrade to.
  // Prefer the manifest's idbVersion (CLI-managed, canonical); fall back
  // to the live database version (standalone runtime without manifest).
  const baseVersion = manifest?.idbVersion ?? currentVersion;
  const targetVersion = baseVersion + 1;

  // Plan the migration: diff the contract's storage schema against
  // `null` (always baseline — IDB's version-change mechanism is the
  // authority on current state, not the planner's fromContract).
  const planner = new IdbMigrationPlanner();
  const planResult = planner.plan({
    contract: contract as unknown,
    schema: null,
    policy: ALLOW_ALL,
    fromContract: null,
    frameworkComponents: [],
    spaceId: "app",
  });

  if (planResult.kind === "failure") {
    throw new Error(planResult.conflicts.map((c) => c.summary).join("; "));
  }

  // No DDL operations needed. This can happen when the schema diff is
  // empty (e.g. only the marker hash changed without structural changes).
  if (planResult.plan.operations.length === 0) return;

  // Execute the migration.
  // The runner opens the database at `targetVersion`, applies DDL inside
  // `upgradeneeded`, then writes the marker in a separate transaction.
  const driver = IdbMigrationControlDriverDescriptor.create({
    dbName: DB_NAME,
    factory: indexedDB,
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

// ── Singleton client ──────────────────────────────────────────────────────────

let _client: ReturnType<typeof createIdbClient> | null = null;

/**
 * Returns the singleton IDB client, running migrations first if needed.
 *
 * Pass `manifest` when the server can provide `prisma-idb.manifest.json`
 * (e.g. via a page loader or API route). When omitted, the runtime probes
 * the live database to discover the current version.
 *
 * @example
 * ```ts
 * // With manifest (SSR-aware):
 * import manifest from '../../prisma-idb.manifest.json' with { type: 'json' };
 * const db = await getDb(contract, manifest);
 *
 * // Without manifest (client-only):
 * const db = await getDb(contract);
 * ```
 */
export async function getDb(contract: IdbContract, manifest?: IdbManifest | null) {
  if (!_client) {
    await migrate(contract, manifest);
    _client = createIdbClient({ contract, dbName: DB_NAME });
  }
  return _client;
}
