import type { TargetBoundComponentDescriptor } from "@prisma-next/framework-components/components";
import type {
  ControlDriverInstance,
  MigrationOperationPolicy,
  MigrationPlan,
  MigrationPlanOperation,
  MigrationRunner,
  MigrationRunnerExecutionChecks,
  MigrationRunnerFailure,
  MigrationRunnerResult,
  MigrationRunnerSuccessValue,
} from "@prisma-next/framework-components/control";
import type { IdbDdlOp } from "./migration-factories";
import { isIdbDdlOp } from "./migration-factories";
import { extractMigrationDriver } from "./migration-driver";

// ── Inline Result helpers ─────────────────────────────────────────────────────
// @prisma-next/utils is not a direct dependency of this package, so we satisfy
// the Ok<T> / NotOk<F> interfaces structurally (TypeScript structural typing).

function makeOk(value: MigrationRunnerSuccessValue): MigrationRunnerResult {
  return {
    ok: true as const,
    value,
    assertOk() {
      return value;
    },
    assertNotOk(): never {
      throw new Error("assertNotOk called on Ok result");
    },
  };
}

function makeNotOk(failure: MigrationRunnerFailure): MigrationRunnerResult {
  return {
    ok: false as const,
    failure,
    assertOk(): never {
      throw new Error("assertOk called on NotOk result");
    },
    assertNotOk() {
      return failure;
    },
  };
}

// ── DDL execution ─────────────────────────────────────────────────────────────

/**
 * Execute a single DDL operation against an open `upgradeneeded` transaction.
 *
 * All IndexedDB DDL (createObjectStore, deleteObjectStore, createIndex,
 * deleteIndex) MUST happen inside the version-change transaction that fires
 * in `upgradeneeded`. The `db` reference and the `tx` reference are both
 * valid only for the duration of that callback.
 */
function applyOneDdlOp(db: IDBDatabase, tx: IDBTransaction, op: IdbDdlOp): void {
  switch (op.kind) {
    case "createObjectStore": {
      db.createObjectStore(op.storeName, {
        keyPath: op.def.keyPath,
        ...(op.def.autoIncrement !== undefined && { autoIncrement: op.def.autoIncrement }),
      });
      return;
    }
    case "dropObjectStore": {
      db.deleteObjectStore(op.storeName);
      return;
    }
    case "createIndex": {
      const store = tx.objectStore(op.storeName);
      store.createIndex(op.indexName, op.def.keyPath, {
        unique: op.def.unique,
        ...(op.def.multiEntry !== undefined && { multiEntry: op.def.multiEntry }),
      });
      return;
    }
    case "dropIndex": {
      const store = tx.objectStore(op.storeName);
      store.deleteIndex(op.indexName);
      return;
    }
  }
}

// ── Upgrade orchestration ─────────────────────────────────────────────────────

/**
 * Open the database at `targetVersion`, apply all DDL ops inside
 * `upgradeneeded`, and resolve once the connection is established.
 *
 * Returns the number of operations applied.
 */
function openAndUpgrade(
  factory: IDBFactory,
  dbName: string,
  targetVersion: number,
  ops: readonly IdbDdlOp[],
  callbacks?: {
    onOperationStart?(op: MigrationPlanOperation): void;
    onOperationComplete?(op: MigrationPlanOperation): void;
  }
): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = factory.open(dbName, targetVersion);

    request.onupgradeneeded = (event) => {
      const target = event.target as IDBOpenDBRequest;
      const db = target.result;
      const tx = target.transaction;
      if (tx === null) {
        reject(new Error("IDB: upgradeneeded fired with null version-change transaction"));
        return;
      }
      for (const op of ops) {
        callbacks?.onOperationStart?.(op);
        applyOneDdlOp(db, tx, op);
        callbacks?.onOperationComplete?.(op);
      }
    };

    request.onsuccess = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      db.close();
      resolve(ops.length);
    };

    request.onerror = (event) => {
      const err = (event.target as IDBOpenDBRequest).error;
      reject(err ?? new Error("IDB: migration open request failed without an error object"));
    };
  });
}

// ── Policy filtering ──────────────────────────────────────────────────────────

function filterByPolicy(ops: readonly IdbDdlOp[], policy: MigrationOperationPolicy): IdbDdlOp[] {
  const allowed = new Set(policy.allowedOperationClasses);
  return ops.filter((op) => allowed.has(op.operationClass));
}

// ── Runner ────────────────────────────────────────────────────────────────────

/**
 * IDB migration runner.
 *
 * Executes an {@link IdbMigrationPlan} by opening the IDB database at the
 * caller-supplied `targetVersion` and running all DDL operations inside the
 * `upgradeneeded` callback.
 *
 * **Requirements:**
 * - `options.driver` must be an `IdbMigrationControlDriver` created via
 *   `IdbMigrationControlDriverDescriptor.create({ dbName, factory, targetVersion })`.
 * - The caller is responsible for computing `targetVersion` and for writing the
 *   new `idbVersion` back to the manifest after a successful run. The runner
 *   does NOT touch the manifest.
 *
 * **Policy:**
 * Ops whose `operationClass` is not in `policy.allowedOperationClasses` are
 * skipped. A plan with zero allowed ops returns success with
 * `operationsExecuted = 0` and does not open the database.
 */
export class IdbMigrationRunner implements MigrationRunner<"idb", "idb"> {
  async execute(options: {
    readonly plan: MigrationPlan;
    readonly driver: ControlDriverInstance<"idb", "idb">;
    readonly destinationContract: unknown;
    readonly policy: MigrationOperationPolicy;
    readonly callbacks?: {
      onOperationStart?(op: MigrationPlanOperation): void;
      onOperationComplete?(op: MigrationPlanOperation): void;
    };
    readonly executionChecks?: MigrationRunnerExecutionChecks;
    readonly frameworkComponents: ReadonlyArray<TargetBoundComponentDescriptor<"idb", "idb">>;
  }): Promise<MigrationRunnerResult> {
    const { plan, driver, policy, callbacks } = options;

    // Extract migration-specific driver fields
    const mDriver = extractMigrationDriver(driver);

    // Validate and collect IDB-specific DDL ops
    const ddlOps: IdbDdlOp[] = [];
    for (const op of plan.operations) {
      if (!isIdbDdlOp(op)) {
        return makeNotOk({
          code: "IDB-RUNNER-001",
          summary: `Unrecognised operation kind in plan: "${String("kind" in op ? op.kind : "<none>")}"`,
          why: "All operations in an IDB migration plan must be IdbDdlOp instances produced by the IDB planner or migration factories.",
        });
      }
      ddlOps.push(op);
    }

    // Apply policy filter
    const allowed = filterByPolicy(ddlOps, policy);

    // Short-circuit: nothing to do
    if (allowed.length === 0) {
      return makeOk({ operationsPlanned: ddlOps.length, operationsExecuted: 0 });
    }

    try {
      const executed = await openAndUpgrade(mDriver.factory, mDriver.dbName, mDriver.targetVersion, allowed, callbacks);
      return makeOk({ operationsPlanned: ddlOps.length, operationsExecuted: executed });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const why = err instanceof Error && err.stack ? err.stack : undefined;
      return makeNotOk({
        code: "IDB-RUNNER-002",
        summary: `Migration execution failed: ${message}`,
        ...(why !== undefined && { why }),
      });
    }
  }
}
