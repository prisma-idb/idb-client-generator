// THIS FILE IS AUTO-GENERATED — do not edit by hand.
// Regenerate with: prisma-next-idb generate-contract-space

import type { Contract } from "./contract";
import { contractSpaceFromJson } from "@prisma-next/migration-tools/spaces";
import contractJson from "./contract.json" with { type: "json" };
import mig_20260604T1009_baseline_meta from "../../../migrations/app/20260604T1009_baseline/migration.json" with { type: "json" };
import mig_20260604T1009_baseline_ops from "../../../migrations/app/20260604T1009_baseline/ops.json" with { type: "json" };
import mig_20260604T1009_migration_meta from "../../../migrations/app/20260604T1009_migration/migration.json" with { type: "json" };
import mig_20260604T1009_migration_ops from "../../../migrations/app/20260604T1009_migration/ops.json" with { type: "json" };

export const contractSpace = contractSpaceFromJson<Contract>({
  contractJson,
  migrations: [
    {
      dirName: "20260604T1009_baseline",
      metadata: mig_20260604T1009_baseline_meta,
      ops: mig_20260604T1009_baseline_ops,
    },
    {
      dirName: "20260604T1009_migration",
      metadata: mig_20260604T1009_migration_meta,
      ops: mig_20260604T1009_migration_ops,
    },
  ],
  headRef: {
    hash: mig_20260604T1009_migration_meta.to,
    invariants: (mig_20260604T1009_migration_meta.providedInvariants ?? []) as readonly string[],
  },
});
