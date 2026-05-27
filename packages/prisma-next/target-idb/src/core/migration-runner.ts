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
  MultiSpaceCapableRunner,
  MultiSpaceRunnerFailure,
  MultiSpaceRunnerPerSpaceOptions,
  MultiSpaceRunnerResult,
} from "@prisma-next/framework-components/control";
import { APP_SPACE_ID } from "@prisma-next/framework-components/control";
import { openAndUpgrade } from "./apply-ddl-op";
import type { IdbDdlOp } from "./migration-factories";
import { isIdbDdlOp } from "./migration-factories";
import { extractMigrationDriver } from "./migration-driver";

// ── Inline Result helpers ─────────────────────────────────────────────────────
// `@prisma-next/utils` is not a direct dependency, so satisfy `Ok<T>`/`NotOk<F>`
// structurally via TypeScript's structural typing.

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

function makeMultiNotOk(failure: MultiSpaceRunnerFailure): MultiSpaceRunnerResult {
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
 * **CLI vs browser asymmetry**:
 *
 * - `execute()` is the in-browser apply path — `auto-migrate.ts` (client-idb)
 *   invokes it, having already walked the contract-space migration chain
 *   from the current marker hash to the head.
 * - `executeAcrossSpaces()` returns a structured refusal — IndexedDB only
 *   exists in the browser, so the framework's CLI control plane (`db init`,
 *   `db update`, `migration apply`) has no live database to talk to. The
 *   refusal points users at `prisma-next-idb preflight` for chain validation.
 *
 * **Multi-tab note (Phase 7.4)**: callers (notably `idb-client.ts`) install
 * a `versionchange` handler on the open connection so that a tab at version
 * N closes when another tab opens at N+1, avoiding the indefinite-block
 * hazard the IDB spec leaves open.
 */
export class IdbMigrationRunner implements MigrationRunner<"idb", "idb">, MultiSpaceCapableRunner<"idb", "idb"> {
  /**
   * Multi-space CLI entry point. IDB cannot be applied from the CLI —
   * `IndexedDB` is a browser API — so this method always returns a
   * structured refusal. Authoring stays in `prisma-next migration new` /
   * `prisma-next migration plan`; validation lives in
   * `prisma-next-idb preflight`; apply happens in the browser the next
   * time the user opens the app via `createAutoMigratingIdbClient`.
   */
  async executeAcrossSpaces(options: {
    readonly driver: ControlDriverInstance<"idb", "idb">;
    readonly perSpaceOptions: ReadonlyArray<MultiSpaceRunnerPerSpaceOptions<"idb", "idb">>;
  }): Promise<MultiSpaceRunnerResult> {
    const failingSpace = options.perSpaceOptions[0]?.space ?? APP_SPACE_ID;
    return makeMultiNotOk({
      code: "IDB-RUNNER-CLI-UNSUPPORTED",
      summary: "IndexedDB migrations cannot be applied from the CLI.",
      why:
        "IndexedDB only exists in the browser; the CLI runs in Node.js. " +
        "There is no live database to apply ops against from this process. " +
        "Migrations apply automatically the next time a user opens the app " +
        "with createAutoMigratingIdbClient.",
      meta: {
        fix:
          "Run `prisma-next-idb preflight` to validate the migration chain " +
          "applies cleanly against a fake-indexeddb shadow before shipping.",
      },
      failingSpace,
    });
  }

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

    const mDriver = extractMigrationDriver(driver);

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

    const allowed = filterByPolicy(ddlOps, policy);

    if (allowed.length === 0) {
      return makeOk({ operationsPlanned: ddlOps.length, operationsExecuted: 0 });
    }

    try {
      const destContract = options.destinationContract as Record<string, unknown> | null | undefined;
      const storage =
        destContract !== null && destContract !== undefined
          ? (destContract["storage"] as Record<string, unknown> | undefined)
          : undefined;
      const marker =
        storage !== undefined && typeof storage["storageHash"] === "string"
          ? {
              space: APP_SPACE_ID,
              storageHash: storage["storageHash"] as string,
              ...(typeof destContract?.["profileHash"] === "string"
                ? { profileHash: destContract["profileHash"] as string }
                : {}),
            }
          : undefined;

      const executed = await openAndUpgrade({
        factory: mDriver.factory,
        dbName: mDriver.dbName,
        targetVersion: mDriver.targetVersion,
        ops: allowed,
        ...(marker !== undefined && { marker }),
        ...(callbacks?.onOperationStart !== undefined && {
          onOperationStart: callbacks.onOperationStart as (op: IdbDdlOp) => void,
        }),
        ...(callbacks?.onOperationComplete !== undefined && {
          onOperationComplete: callbacks.onOperationComplete as (op: IdbDdlOp) => void,
        }),
      });

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

// Re-export helpers so target-idb/migration exposes them for downstream
// consumers (client-idb auto-migrate, family-idb preflight).
export { applyOneDdlOp, openAndUpgrade, writeMarker, readMarker } from "./apply-ddl-op";
export type { IdbMarkerRecord, MarkerWriteInput } from "./apply-ddl-op";
