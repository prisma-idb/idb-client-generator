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

// ── TypeScript scaffold renderer ──────────────────────────────────────────────

/**
 * Render a class-based `migration.ts` scaffold from a planner-derived ops
 * list plus the `describe()` identity bookends. The output is the
 * canonical authoring surface — identical in shape to vendor's Postgres
 * `renderCallsToTypeScript` (shebang → imports → class → describe →
 * operations → MigrationCLI.run).
 *
 * @internal
 */
function renderMigrationTs(input: {
  readonly fromHash: string | null;
  readonly toHash: string;
  readonly ops: readonly IdbDdlOp[];
}): string {
  const { fromHash, toHash, ops } = input;

  const factoryImports = collectFactoryImports(ops);
  const importList = ["Migration", "MigrationCLI", ...factoryImports].join(", ");

  const operationsBlock =
    ops.length === 0
      ? [
          "    return [",
          "      // Add IDB DDL operations here (createObjectStoreOp, createIndexOp, ...).",
          "    ];",
        ].join("\n")
      : ["    return [", ops.map((op) => `      ${renderOpCall(op)},`).join("\n"), "    ];"].join("\n");

  return [
    "#!/usr/bin/env -S npx tsx",
    `import { ${importList} } from "@prisma-next-idb/target-idb/migration";`,
    "",
    "export default class M extends Migration {",
    "  override describe() {",
    "    return {",
    `      from: ${JSON.stringify(fromHash)},`,
    `      to: ${JSON.stringify(toHash)},`,
    "    };",
    "  }",
    "",
    "  override get operations() {",
    operationsBlock,
    "  }",
    "}",
    "",
    "MigrationCLI.run(import.meta.url, M);",
    "",
  ].join("\n");
}

function collectFactoryImports(ops: readonly IdbDdlOp[]): string[] {
  const names = new Set<string>();
  for (const op of ops) {
    switch (op.kind) {
      case "createObjectStore":
        names.add("createObjectStoreOp");
        break;
      case "dropObjectStore":
        names.add("dropObjectStoreOp");
        break;
      case "createIndex":
        names.add("createIndexOp");
        break;
      case "dropIndex":
        names.add("dropIndexOp");
        break;
    }
  }
  return [...names].sort();
}

function renderOpCall(op: IdbDdlOp): string {
  switch (op.kind) {
    case "createObjectStore": {
      const optsParts = [`keyPath: ${JSON.stringify(op.def.keyPath)}`];
      if (op.def.autoIncrement !== undefined) {
        optsParts.push(`autoIncrement: ${op.def.autoIncrement}`);
      }
      return `createObjectStoreOp(${JSON.stringify(op.storeName)}, { ${optsParts.join(", ")} })`;
    }
    case "dropObjectStore":
      return `dropObjectStoreOp(${JSON.stringify(op.storeName)})`;
    case "createIndex": {
      // IDB defaults `unique` to false when absent; the IR sometimes omits it
      // after canonicalisation. Default to false in the rendered TS so the
      // output is always valid.
      const unique = op.def.unique ?? false;
      const optsParts = [`keyPath: ${JSON.stringify(op.def.keyPath)}`, `unique: ${unique}`];
      if (op.def.multiEntry !== undefined) {
        optsParts.push(`multiEntry: ${op.def.multiEntry}`);
      }
      return `createIndexOp(${JSON.stringify(op.storeName)}, ${JSON.stringify(op.indexName)}, { ${optsParts.join(", ")} })`;
    }
    case "dropIndex":
      return `dropIndexOp(${JSON.stringify(op.storeName)}, ${JSON.stringify(op.indexName)})`;
  }
}

// ── Planner ───────────────────────────────────────────────────────────────────

/**
 * IDB migration planner.
 *
 * `plan()` converts `fromContract` and `contract` into `IdbSchemaDiffInput`s,
 * diffs them using {@link diffIdbSchema}, and returns an
 * {@link IdbMigrationPlanWithAuthoring} that can be executed by
 * {@link IdbMigrationRunner} or rendered to a TypeScript migration file via
 * the class-based scaffold matching vendor's Postgres/Mongo authoring surface.
 *
 * The planner does NOT apply the policy — it always returns the full op set.
 * Policy enforcement happens in the runner and in the browser-side
 * auto-migrate path.
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

    const fromHash = fromContract !== null ? extractStorageHash(fromContract) : null;
    const toHash = extractStorageHash(contract);

    const plan: IdbMigrationPlanWithAuthoring = {
      targetId: "idb",
      // `null` means "no origin validation" — the runner skips the origin check.
      origin: fromHash !== null ? { storageHash: fromHash } : null,
      destination: { storageHash: toHash },
      operations: ops,
      renderTypeScript() {
        return renderMigrationTs({ fromHash, toHash, ops });
      },
    };

    return { kind: "success", plan };
  }

  emptyMigration(context: MigrationScaffoldContext, _spaceId: string): MigrationPlanWithAuthoringSurface {
    const { fromHash, toHash } = context;
    return {
      targetId: "idb",
      origin: fromHash !== null ? { storageHash: fromHash } : null,
      destination: { storageHash: toHash },
      operations: [],
      renderTypeScript() {
        return renderMigrationTs({ fromHash, toHash, ops: [] });
      },
    };
  }
}
