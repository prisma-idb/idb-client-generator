import type { Contract } from "@prisma-next/contract/types";
import type {
  ContractSpace,
  MigrationOperationClass,
  MigrationPackage,
} from "@prisma-next/framework-components/control";
import { APP_SPACE_ID } from "@prisma-next/framework-components/control";
// Browser-safe (WebCrypto) hash — the framework's `@prisma-next/migration-tools/hash`
// uses `node:crypto` and throws in the browser (PLAN Issue #23 regression).
import { computeMigrationHash } from "./migration-hash";
// Import from `./runtime` (not `./migration`) so `MigrationCLI` → `node:fs`
// is not bundled into the browser client.
import { isIdbDdlOp, openAndUpgrade, readMarker, type IdbDdlOp } from "@prisma-next-idb/target-idb/runtime";
import { createIdbClient, type IdbClient } from "./idb-client";
import type { IdbContract } from "./types";

// ── Public policy types ──────────────────────────────────────────────────────

/**
 * Migration policy for the browser-side apply path.
 *
 * Two knobs:
 *
 * - `allowedOperationClasses`: filter applied to each op's `operationClass`.
 *   Defaults to `['additive', 'widening']`. Anything outside this set is
 *   dropped before the upgrade transaction opens.
 * - `onDestructive`: what to do if the planner emitted a destructive op
 *   that the filter just dropped. `'refuse'` (default) throws so the user
 *   sees the situation; `'allow'` re-includes destructive ops.
 *
 * Default is **safe**: a contract change that drops a store will refuse to
 * apply unless the developer opts in. A user's local IDB can hold months
 * of accumulated state (drafts, offline queue, cached content) and the
 * spec explicitly calls out the silent-data-loss risk if destructive ops
 * apply on every page load. See `FEEDBACKS.md` §4.
 */
export interface MigrationPolicy {
  readonly allowedOperationClasses?: readonly MigrationOperationClass[];
  readonly onDestructive?: "refuse" | "allow";
}

const SAFE_POLICY: Required<MigrationPolicy> = {
  allowedOperationClasses: ["additive", "widening"],
  onDestructive: "refuse",
};

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Options for {@link createAutoMigratingIdbClient}.
 *
 * `contractSpace` is the bundled artefact produced at design time by
 * `prisma-next-idb generate-contract-space`. It carries the canonical
 * contract JSON, the ordered list of migration packages, and the head
 * ref the runtime walks toward.
 */
export interface AutoMigrateClientOptions<TContract extends IdbContract> {
  readonly contractSpace: ContractSpace<TContract>;
  readonly dbName: string;
  /** Migration policy. Defaults to safe (additive + widening only, refuse destructive). */
  readonly policy?: MigrationPolicy;
  /** IDB factory override — primarily for tests. Defaults to `indexedDB`. */
  readonly factory?: IDBFactory;
}

/**
 * Create a typed IDB client, applying any pending migrations from the bundled
 * `contractSpace` first.
 *
 * **What runs**:
 *
 * 1. Open the database at the current local version, read the marker from
 *    `_prisma_next_marker`. (Null for a fresh database)
 * 2. If the marker hash equals `contractSpace.headRef.hash`, the database
 *    is already at the target — return the client immediately.
 * 3. Otherwise, walk `contractSpace.migrations` from the marker hash (or
 *    `null` for fresh) to `headRef.hash`, collecting each pending
 *    package's `ops` in chain order.
 * 4. Apply the policy filter. Refuse if any destructive op was filtered
 *    out and `onDestructive === 'refuse'`.
 * 5. Reopen at `db.version + 1` so `upgradeneeded` fires; apply every
 *    collected op inside the version-change transaction.
 * 6. Write the marker to `headRef.hash` in a separate readwrite tx.
 * 7. Hand back the typed `IdbClient`.
 *
 * **What does NOT run in the browser**:
 *
 * The planner does not ship to the browser. The differ does not run. Live-DB
 * schema introspection does not happen. All the planning was done once at
 * design time and is encoded in the bundled `ops.json` blobs inside
 * `contractSpace.migrations`.
 *
 * @example
 * ```ts
 * import { createAutoMigratingIdbClient } from '@prisma-next-idb/client-idb/client-auto';
 * import { contractSpace } from './prisma/contract-space.generated';
 *
 * const db = await createAutoMigratingIdbClient({ contractSpace, dbName: 'my-app' });
 * const users = await db.orm.users.all().toArray();
 * ```
 */
export async function createAutoMigratingIdbClient<TContract extends IdbContract>(
  options: AutoMigrateClientOptions<TContract>
): Promise<IdbClient<TContract>> {
  const factory = options.factory ?? indexedDB;
  const policy = mergePolicy(options.policy);

  await autoMigrate({
    // The public `AutoMigrateClientOptions<TContract>` is generic over the
    // user's narrow IDB contract; the internal `autoMigrate` only consumes
    // chain-walking fields, so widen to `ContractSpace<Contract>` here.
    contractSpace: options.contractSpace as unknown as ContractSpace<Contract>,
    dbName: options.dbName,
    policy,
    factory,
  });

  return createIdbClient({
    contract: options.contractSpace.contractJson,
    dbName: options.dbName,
    factory,
  });
}

function mergePolicy(p?: MigrationPolicy): Required<MigrationPolicy> {
  return {
    allowedOperationClasses: p?.allowedOperationClasses ?? SAFE_POLICY.allowedOperationClasses,
    onDestructive: p?.onDestructive ?? SAFE_POLICY.onDestructive,
  };
}

// ── Core migration loop ──────────────────────────────────────────────────────

/**
 * The migration loop. Exported for tests.
 *
 * @internal Prefer {@link createAutoMigratingIdbClient}.
 */
export async function autoMigrate(input: {
  // `ContractSpace<Contract>` instead of `<unknown>` so the generic
  // constraint `TContract extends Contract` from the framework is satisfied.
  // The internal apply path only reads `headRef.hash` and `migrations`, so
  // the precise contract shape inside `contractJson` doesn't matter here.
  readonly contractSpace: ContractSpace<Contract>;
  readonly dbName: string;
  readonly policy: Required<MigrationPolicy>;
  readonly factory: IDBFactory;
}): Promise<void> {
  const { contractSpace, dbName, policy, factory } = input;
  const targetHash = contractSpace.headRef.hash;

  // 1 + 2: read current version and marker.
  const { currentVersion, markerHash } = await openAndReadMarker(dbName, factory);
  if (markerHash === targetHash) return;

  // 3: collect pending ops from chain walk.
  const { pendingOps, destructiveDropped } = await walkChain({
    markerHash,
    headHash: targetHash,
    migrations: contractSpace.migrations,
    policy,
  });

  // 4: refuse if destructive ops were dropped under refuse policy.
  if (destructiveDropped > 0 && policy.onDestructive === "refuse") {
    throw new Error(
      `Auto-migration refused: ${destructiveDropped} destructive operation(s) ` +
        "in the pending chain would drop user data. To allow them, pass " +
        "`policy: { onDestructive: 'allow' }` to createAutoMigratingIdbClient. " +
        "Per-tab persistent state (drafts, offline queue, cached content) will " +
        "be lost when destructive ops apply silently — review the change before opting in."
    );
  }

  if (pendingOps.length === 0) return;

  // 5 + 6: apply ops in upgradeneeded, write marker afterwards.
  await openAndUpgrade({
    factory,
    dbName,
    targetVersion: currentVersion + 1,
    ops: pendingOps,
    marker: { space: APP_SPACE_ID, storageHash: targetHash },
  });
}

interface WalkResult {
  readonly pendingOps: IdbDdlOp[];
  readonly destructiveDropped: number;
}

/**
 * Walk the migration chain from `markerHash` (or `null` for a fresh DB) to
 * `headHash`, collecting each pending package's ops in order. Applies the
 * policy filter on each op as it's added; returns the count of destructive
 * ops that were dropped so the caller can refuse if the policy demands.
 *
 * Throws on chain discontinuity (no package whose `from === cursor`) so
 * misconfigured `contractSpace` inputs fail loudly rather than silently
 * leaving the DB at an intermediate state.
 */
async function walkChain(input: {
  readonly markerHash: string | null;
  readonly headHash: string;
  readonly migrations: readonly MigrationPackage[];
  readonly policy: Required<MigrationPolicy>;
}): Promise<WalkResult> {
  const byFrom = new Map<string | null, MigrationPackage>();
  for (const pkg of input.migrations) {
    byFrom.set(pkg.metadata.from, pkg);
  }

  const allowed = new Set(input.policy.allowedOperationClasses);
  const pendingOps: IdbDdlOp[] = [];
  let destructiveDropped = 0;
  let cursor: string | null = input.markerHash;
  const visited = new Set<string | null>();

  while (cursor !== input.headHash) {
    if (visited.has(cursor)) {
      throw new Error(
        `Auto-migration chain contains a cycle at hash ${JSON.stringify(cursor)}. ` +
          "Re-run `prisma-next-idb generate-contract-space` to rebuild a valid chain."
      );
    }
    visited.add(cursor);
    const next = byFrom.get(cursor);
    if (!next) {
      throw new Error(
        `Auto-migration chain broken: no migration package with from === ${JSON.stringify(cursor)}. ` +
          "Verify that contract-space.generated.ts is up to date by re-running " +
          "`prisma-next-idb generate-contract-space`."
      );
    }
    const computedHash = await computeMigrationHash(next.metadata, next.ops);
    if (computedHash !== next.metadata.migrationHash) {
      throw new Error(
        `Migration package "${next.dirName}" failed integrity check: ` +
          `stored migrationHash ${next.metadata.migrationHash} does not match ` +
          `computed hash ${computedHash}. ` +
          "The ops may have been edited after the package was generated. " +
          "Re-run `prisma-next migration plan` to regenerate the package."
      );
    }
    for (const op of next.ops) {
      if (!isIdbDdlOp(op)) {
        throw new Error(`Non-IDB operation found in migration package ${next.dirName}: ${JSON.stringify(op)}`);
      }
      if (allowed.has(op.operationClass)) {
        pendingOps.push(op);
      } else if (op.operationClass === "destructive") {
        if (input.policy.onDestructive === "allow") {
          pendingOps.push(op);
        } else {
          destructiveDropped += 1;
        }
      }
      // Other classes filtered silently.
    }
    cursor = next.metadata.to;
  }

  return { pendingOps, destructiveDropped };
}

/**
 * Open the database at its current local version (no version arg), read the
 * marker, then close the connection. Returns the current integer version so
 * the caller can compute `currentVersion + 1` for the upgrade re-open.
 */
function openAndReadMarker(
  dbName: string,
  factory: IDBFactory
): Promise<{ currentVersion: number; markerHash: string | null }> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(dbName);
    } catch (err) {
      reject(err);
      return;
    }

    req.onsuccess = () => {
      const db = req.result;
      const currentVersion = db.version;
      void (async () => {
        try {
          const record = await readMarker(db, APP_SPACE_ID);
          resolve({ currentVersion, markerHash: record?.storageHash ?? null });
        } catch (err) {
          reject(err);
        } finally {
          db.close();
        }
      })();
    };
    req.onerror = () => {
      reject(req.error ?? new Error(`IDB open failed while reading marker for "${dbName}"`));
    };
  });
}
