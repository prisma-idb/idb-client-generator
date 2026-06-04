import type { ContractMarkerRecord } from "@prisma-next/contract/types";
import { IDB_MARKER_STORE, type IdbDdlOp } from "./migration-factories";

/**
 * Execute a single DDL operation against an open `upgradeneeded` transaction.
 *
 * All IndexedDB DDL (createObjectStore, deleteObjectStore, createIndex,
 * deleteIndex) MUST happen inside the version-change transaction that fires
 * in `upgradeneeded`. The `db` and `tx` references are valid only for the
 * duration of that callback.
 *
 * Shared by the runner (target-idb), the browser auto-migrate path
 * (client-idb), and the preflight CLI (family-idb) so all three apply paths
 * use a single, byte-identical implementation.
 *
 * **Idempotency.** Each op is guarded by an existence check so re-applying an
 * already-applied op is a no-op rather than a throw. This is the load-bearing
 * guarantee behind the two-phase marker write (ADR 002): if a tab is killed in
 * the window between the version-change transaction committing and the marker
 * `put` landing, the schema is advanced but the marker still points at the old
 * hash. On the next open, the chain walk re-collects the already-applied ops
 * and replays them here. Without the guards, `createObjectStore` /
 * `createIndex` throw `ConstraintError` on the existing store/index, the
 * version-change transaction aborts, and the database is permanently wedged
 * (every subsequent open repeats the failed upgrade). Contrary to a common
 * assumption, IndexedDB itself offers **no** "already exists" tolerance — these
 * guards are what make replay safe. (Was PLAN Issue #25.)
 */
export function applyOneDdlOp(db: IDBDatabase, tx: IDBTransaction, op: IdbDdlOp): void {
  switch (op.kind) {
    case "createObjectStore": {
      if (db.objectStoreNames.contains(op.storeName)) return;
      db.createObjectStore(op.storeName, {
        keyPath: op.def.keyPath,
        ...(op.def.autoIncrement !== undefined && { autoIncrement: op.def.autoIncrement }),
      });
      return;
    }
    case "dropObjectStore": {
      if (!db.objectStoreNames.contains(op.storeName)) return;
      db.deleteObjectStore(op.storeName);
      return;
    }
    case "createIndex": {
      const store = tx.objectStore(op.storeName);
      if (store.indexNames.contains(op.indexName)) return;
      store.createIndex(op.indexName, op.def.keyPath, {
        unique: op.def.unique,
        ...(op.def.multiEntry !== undefined && { multiEntry: op.def.multiEntry }),
      });
      return;
    }
    case "dropIndex": {
      const store = tx.objectStore(op.storeName);
      if (!store.indexNames.contains(op.indexName)) return;
      store.deleteIndex(op.indexName);
      return;
    }
  }
}

/**
 * Marker write input. The `space` field is the contract-space identifier
 * (`"app"` for the single app space; per-extension callers pass their own
 * space id when extensions land on IDB). All other fields mirror
 * {@link ContractMarkerRecord} exactly so the in-DB record has full parity
 * with the framework's canonical marker shape.
 */
export interface MarkerWriteInput {
  readonly space: string;
  readonly storageHash: string;
  readonly profileHash?: string;
  readonly invariants?: readonly string[];
  readonly contractJson?: unknown;
  readonly canonicalVersion?: number | null;
  readonly appTag?: string | null;
  readonly meta?: Record<string, unknown>;
}

/**
 * In-DB marker record shape stored in `_prisma_next_marker`.
 *
 * Identical to {@link ContractMarkerRecord} plus the keying `space` field;
 * `updatedAt` is a `Date` (not an ISO string) because IndexedDB serialises
 * Dates natively via structured-clone.
 */
export type IdbMarkerRecord = ContractMarkerRecord & { readonly space: string };

/**
 * Write the contract marker into the `_prisma_next_marker` store using a
 * separate `readwrite` transaction. The marker store is created inside the
 * version-change transaction during the migration's first run (see
 * `createMarkerStoreOp`); subsequent runs reuse it.
 *
 * Keyed by `space` (defaulting to `"app"` at the caller layer) so the
 * storage layout doesn't have to be migrated when IDB eventually grows
 * extension support (see ADR 021 + feedback issue #5).
 */
export function writeMarker(db: IDBDatabase, input: MarkerWriteInput): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(IDB_MARKER_STORE)) {
      // Marker store missing — should never happen because the planner emits
      // its creation as the first op. Non-fatal so the runner can still
      // report DDL success, but worth surfacing as a planner invariant bug.
      console.warn(
        "[prisma-next] _prisma_next_marker store not found after DDL — this indicates a bug in the migration planner."
      );
      resolve();
      return;
    }
    const tx = db.transaction(IDB_MARKER_STORE, "readwrite");
    const store = tx.objectStore(IDB_MARKER_STORE);
    const record: IdbMarkerRecord = {
      space: input.space,
      storageHash: input.storageHash,
      profileHash: input.profileHash ?? "",
      updatedAt: new Date(),
      invariants: input.invariants ?? [],
      contractJson: input.contractJson ?? null,
      canonicalVersion: input.canonicalVersion ?? null,
      appTag: input.appTag ?? null,
      meta: input.meta ?? {},
    };
    const putReq = store.put(record);
    putReq.onerror = () => reject(putReq.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Read the marker record for a given space from the `_prisma_next_marker`
 * store. Returns `null` when the store doesn't exist (fresh DB) or the
 * record is absent.
 */
export function readMarker(db: IDBDatabase, space: string): Promise<IdbMarkerRecord | null> {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains(IDB_MARKER_STORE)) {
      resolve(null);
      return;
    }
    const tx = db.transaction(IDB_MARKER_STORE, "readonly");
    const store = tx.objectStore(IDB_MARKER_STORE);
    const req = store.get(space);
    req.onsuccess = () => {
      const result = req.result as IdbMarkerRecord | undefined;
      resolve(result ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Open `dbName` at `targetVersion`, apply `ops` inside the `upgradeneeded`
 * callback, optionally write the contract marker (in a separate readwrite
 * tx after `onsuccess`), then close the connection.
 *
 * Returns the number of ops applied. Throws on open-request error or DDL
 * application error.
 */
export function openAndUpgrade(input: {
  readonly factory: IDBFactory;
  readonly dbName: string;
  readonly targetVersion: number;
  readonly ops: readonly IdbDdlOp[];
  readonly marker?: MarkerWriteInput;
  readonly onOperationStart?: (op: IdbDdlOp) => void;
  readonly onOperationComplete?: (op: IdbDdlOp) => void;
}): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = input.factory.open(input.dbName, input.targetVersion);

    request.onupgradeneeded = (event) => {
      const target = event.target as IDBOpenDBRequest;
      const db = target.result;
      const tx = target.transaction;
      if (tx === null) {
        reject(new Error("IDB: upgradeneeded fired with null version-change transaction"));
        return;
      }
      for (const op of input.ops) {
        input.onOperationStart?.(op);
        applyOneDdlOp(db, tx, op);
        input.onOperationComplete?.(op);
      }
    };

    request.onsuccess = async (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      try {
        if (input.marker !== undefined) {
          await writeMarker(db, input.marker);
        }
      } finally {
        db.close();
      }
      resolve(input.ops.length);
    };

    request.onerror = (event) => {
      const err = (event.target as IDBOpenDBRequest).error;
      reject(err ?? new Error("IDB: migration open request failed without an error object"));
    };
  });
}
