/**
 * Test helper: build an in-memory `ContractSpace` from a sequence of
 * contracts (the chain of versions a user would evolve through).
 *
 * Uses `IdbMigrationPlanner` at test-setup time to compute the ops for
 * each `from → to` transition, then wraps them in `MigrationPackage`
 * shapes the way `prisma-next-idb generate-contract-space` would in a
 * real project.
 */

import type { Contract } from "@prisma-next/contract/types";
import type { ContractSpace, MigrationPackage } from "@prisma-next/framework-components/control";
import { IdbMigrationPlanner } from "@prisma-next-idb/target-idb/migration";

function getStorageHash(contract: unknown): string {
  return (contract as { storage: { storageHash: string } }).storage.storageHash;
}

/**
 * Build a `ContractSpace` from an ordered list of contract versions
 * (`[v1, v2, v3, ...]`). The space's `migrations` array has one package
 * per transition (`null → v1`, `v1 → v2`, …); `headRef.hash` points at
 * the last version's storage hash.
 */
export function buildContractSpaceFixture<TContract extends Contract>(
  versions: readonly TContract[]
): ContractSpace<TContract> {
  if (versions.length === 0) {
    throw new Error("buildContractSpaceFixture requires at least one contract version");
  }

  const planner = new IdbMigrationPlanner();
  const migrations: MigrationPackage[] = [];

  let previous: TContract | null = null;
  let index = 0;
  for (const current of versions) {
    const planResult = planner.plan({
      contract: current,
      schema: null,
      policy: { allowedOperationClasses: ["additive", "widening", "destructive", "data"] },
      fromContract: previous,
      frameworkComponents: [],
      spaceId: "app",
    });
    if (planResult.kind !== "success") {
      throw new Error(`Planner failed for version ${index}: ${JSON.stringify(planResult.conflicts)}`);
    }

    migrations.push({
      dirName: `${String(index).padStart(4, "0")}_v${index + 1}`,
      metadata: {
        from: previous === null ? null : getStorageHash(previous),
        to: getStorageHash(current),
        // The fixture omits the real `migrationHash` because the auto-migrate
        // path doesn't validate it — only the chain `from`/`to` edges matter
        // here. Real `ops.json` files produced by `MigrationCLI.run` carry
        // a content-addressed `migrationHash`.
        migrationHash: `sha256:fixture-${index}`,
        providedInvariants: [],
        labels: [],
        hints: { used: [], applied: [], plannerVersion: "2.0.0" },
        createdAt: new Date(2026, 0, 1, 0, 0, index).toISOString(),
      },
      ops: planResult.plan.operations,
    });

    previous = current;
    index += 1;
  }

  return {
    contractJson: versions[versions.length - 1] as TContract,
    migrations,
    headRef: {
      hash: getStorageHash(versions[versions.length - 1]),
      invariants: [],
    },
  };
}
