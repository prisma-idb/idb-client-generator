import type { Contract } from "@prisma-next/contract/types";
import type { TargetBoundComponentDescriptor } from "@prisma-next/framework-components/components";
import type {
  MigrationOperationPolicy,
  MigrationPlanWithAuthoringSurface,
  MigrationPlanner,
  MigrationPlannerResult,
  MigrationScaffoldContext,
} from "@prisma-next/framework-components/control";
import type { IdbStoreDefinition } from "./idb-contract-types";
import { createMarkerStoreOp, type IdbDdlOp } from "./migration-factories";
import type { IdbSchemaDiffInput } from "./schema-diff";
import { diffIdbSchema } from "./schema-diff";

// ── Plan type ─────────────────────────────────────────────────────────────────

/**
 * IDB-specific migration plan.
 *
 * Extends `MigrationPlanWithAuthoringSurface` by narrowing `operations` to
 * `readonly IdbDdlOp[]`. This is a valid covariant narrowing because
 * `IdbDdlOp extends MigrationPlanOperation`.
 *
 * The runner re-casts `plan.operations` back to `readonly IdbDdlOp[]` via
 * `isIdbDdlOp` validation.
 */
export interface IdbMigrationPlanWithAuthoring extends MigrationPlanWithAuthoringSurface {
  readonly operations: readonly IdbDdlOp[];
}

// ── Contract → schema IR extraction ──────────────────────────────────────────

/**
 * Extract an `IdbSchemaDiffInput` from a raw contract object.
 *
 * Returns `null` for a null contract (fresh database — no prior schema).
 * The extraction is dynamic because contracts arrive as `unknown` / `Contract`
 * at planner call sites.
 */
export function contractToIdbSchema(contract: Contract | null | unknown): IdbSchemaDiffInput | null {
  if (contract === null || typeof contract !== "object") return null;
  const storage = (contract as Record<string, unknown>)["storage"];
  if (storage === null || typeof storage !== "object") return null;
  const stores = (storage as Record<string, unknown>)["stores"];
  if (stores === null || typeof stores !== "object") return null;
  return { stores: stores as Record<string, IdbStoreDefinition> };
}

function extractStorageHash(contract: Contract | null | unknown): string {
  if (contract === null || typeof contract !== "object") return "unknown";
  const storage = (contract as Record<string, unknown>)["storage"];
  if (storage === null || typeof storage !== "object") return "unknown";
  const hash = (storage as Record<string, unknown>)["storageHash"];
  return typeof hash === "string" ? hash : "unknown";
}

// ── TypeScript scaffold template ──────────────────────────────────────────────

const EMPTY_MIGRATION_STUB = `\
import type { IdbMigration } from "@prisma-next-idb/target-idb/migration";

const migration: IdbMigration = {
  operations: [
    // Add IDB DDL operations here, e.g.:
    // createObjectStoreOp("users", { keyPath: "id" }),
    // createIndexOp("users", "email_idx", { keyPath: "email", unique: true }),
  ],
};

export default migration;
`;

function renderDdlOpsTs(ops: readonly IdbDdlOp[]): string {
  if (ops.length === 0) return EMPTY_MIGRATION_STUB;

  const imports = new Set<string>();
  const lines: string[] = [];

  for (const op of ops) {
    switch (op.kind) {
      case "createObjectStore": {
        imports.add("createObjectStoreOp");
        const optsParts = [`keyPath: "${op.def.keyPath}"`];
        if (op.def.autoIncrement !== undefined) {
          optsParts.push(`autoIncrement: ${String(op.def.autoIncrement)}`);
        }
        lines.push(`    createObjectStoreOp("${op.storeName}", { ${optsParts.join(", ")} }),`);
        break;
      }
      case "dropObjectStore": {
        imports.add("dropObjectStoreOp");
        lines.push(`    dropObjectStoreOp("${op.storeName}"),`);
        break;
      }
      case "createIndex": {
        imports.add("createIndexOp");
        const optsParts = [`keyPath: "${op.def.keyPath}"`, `unique: ${String(op.def.unique)}`];
        if (op.def.multiEntry !== undefined) {
          optsParts.push(`multiEntry: ${String(op.def.multiEntry)}`);
        }
        lines.push(`    createIndexOp("${op.storeName}", "${op.indexName}", { ${optsParts.join(", ")} }),`);
        break;
      }
      case "dropIndex": {
        imports.add("dropIndexOp");
        lines.push(`    dropIndexOp("${op.storeName}", "${op.indexName}"),`);
        break;
      }
    }
  }

  const importList = [...imports].sort().join(", ");
  return `\
import { ${importList} } from "@prisma-next-idb/target-idb/migration";
import type { IdbMigration } from "@prisma-next-idb/target-idb/migration";

const migration: IdbMigration = {
  operations: [
${lines.join("\n")}
  ],
};

export default migration;
`;
}

// ── Planner ───────────────────────────────────────────────────────────────────

/**
 * IDB migration planner.
 *
 * `plan()` converts `fromContract` and `contract` into `IdbSchemaDiffInput`s,
 * diffs them using {@link diffIdbSchema}, and returns an
 * {@link IdbMigrationPlanWithAuthoring} that can be executed by
 * {@link IdbMigrationRunner} or rendered to a TypeScript migration file.
 *
 * The planner does NOT apply the policy — it always returns the full op set.
 * Policy enforcement happens in the runner.
 */
export class IdbMigrationPlanner implements MigrationPlanner<"idb", "idb"> {
  plan(options: {
    readonly contract: unknown;
    readonly schema: unknown;
    readonly policy: MigrationOperationPolicy;
    readonly fromContract: Contract | null;
    readonly frameworkComponents: ReadonlyArray<TargetBoundComponentDescriptor<"idb", "idb">>;
    /**
     * Contract space this plan applies to.
     *
     * Stamped onto the produced plan so the runner keys the marker row
     * by the right space. IDB only has a single space (`"app"`), but
     * the parameter is required by the framework's
     * {@link MigrationPlanner} interface (added for multi-space support
     * in contract-spaces ADR 212). Ignored by the IDB planner — all
     * IDB schemas are single-space.
     */
    readonly spaceId: string;
  }): MigrationPlannerResult {
    const { contract, fromContract } = options;

    const fromSchema = contractToIdbSchema(fromContract);
    const toSchema = contractToIdbSchema(contract);

    if (toSchema === null) {
      return {
        kind: "failure",
        conflicts: [
          {
            kind: "invalidContract",
            summary:
              "Could not extract IDB schema from contract. " +
              "Expected contract.storage.stores to be a record of IdbStoreDefinition.",
          },
        ],
      };
    }

    const ops = diffIdbSchema(fromSchema, toSchema);

    // On first migration (fresh database), create the internal
    // _prisma_next_marker store so the runtime can verify the
    // contract marker before executing queries. Subsequent migrations
    // don't need this — the marker store persists across upgrades
    // since it's an internal store not declared in the user's contract.
    if (fromSchema === null) {
      ops.unshift(createMarkerStoreOp());
    }

    const fromHash = extractStorageHash(fromContract);
    const toHash = extractStorageHash(contract);

    const plan: IdbMigrationPlanWithAuthoring = {
      targetId: "idb",
      // `null` means "no origin validation" — the runner skips the origin check.
      origin: fromContract !== null ? { storageHash: fromHash } : null,
      destination: { storageHash: toHash },
      operations: ops,
      renderTypeScript() {
        return renderDdlOpsTs(ops);
      },
    };

    return { kind: "success", plan };
  }

  emptyMigration(_context: MigrationScaffoldContext): MigrationPlanWithAuthoringSurface {
    return {
      targetId: "idb",
      origin: null,
      destination: { storageHash: "pending" },
      operations: [],
      renderTypeScript() {
        return EMPTY_MIGRATION_STUB;
      },
    };
  }
}
