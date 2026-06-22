// THIS FILE IS AUTO-GENERATED — do not edit by hand.
// Regenerate with: prisma-next-idb generate-contract-space

import type { Contract } from "./contract";
import { contractSpaceFromJson } from "@prisma-next/migration-tools/spaces";
import contractJson from "./contract.json" with { type: "json" };
import mig_20260621T1213_baseline_meta from "../../../migrations/app/20260621T1213_baseline/migration.json" with { type: "json" };
import mig_20260621T1213_baseline_ops from "../../../migrations/app/20260621T1213_baseline/ops.json" with { type: "json" };
import mig_20260621T1214_add_tag_meta from "../../../migrations/app/20260621T1214_add_tag/migration.json" with { type: "json" };
import mig_20260621T1214_add_tag_ops from "../../../migrations/app/20260621T1214_add_tag/ops.json" with { type: "json" };

export const contractSpace = contractSpaceFromJson<Contract>({
  contractJson,
  migrations: [
    {
      dirName: "20260621T1213_baseline",
      metadata: mig_20260621T1213_baseline_meta,
      ops: mig_20260621T1213_baseline_ops,
    },
    { dirName: "20260621T1214_add_tag", metadata: mig_20260621T1214_add_tag_meta, ops: mig_20260621T1214_add_tag_ops },
  ],
  headRef: {
    hash: mig_20260621T1214_add_tag_meta.to,
    invariants: (mig_20260621T1214_add_tag_meta.providedInvariants ?? []) as readonly string[],
  },
});
