// THIS FILE IS AUTO-GENERATED — do not edit by hand.
// Regenerate with: prisma-next-idb generate-contract-space

import type { Contract } from "./contract";
import { contractSpaceFromJson } from "@prisma-next/migration-tools/spaces";
import contractJson from "./contract.json" with { type: "json" };
import mig_20260621T1057_baseline_meta from "../../../migrations/app/20260621T1057_baseline/migration.json" with { type: "json" };
import mig_20260621T1057_baseline_ops from "../../../migrations/app/20260621T1057_baseline/ops.json" with { type: "json" };
import mig_20260621T1157_add_todo_boards_meta from "../../../migrations/app/20260621T1157_add_todo_boards/migration.json" with { type: "json" };
import mig_20260621T1157_add_todo_boards_ops from "../../../migrations/app/20260621T1157_add_todo_boards/ops.json" with { type: "json" };

export const contractSpace = contractSpaceFromJson<Contract>({
  contractJson,
  migrations: [
    {
      dirName: "20260621T1057_baseline",
      metadata: mig_20260621T1057_baseline_meta,
      ops: mig_20260621T1057_baseline_ops,
    },
    {
      dirName: "20260621T1157_add_todo_boards",
      metadata: mig_20260621T1157_add_todo_boards_meta,
      ops: mig_20260621T1157_add_todo_boards_ops,
    },
  ],
  headRef: {
    hash: mig_20260621T1157_add_todo_boards_meta.to,
    invariants: (mig_20260621T1157_add_todo_boards_meta.providedInvariants ?? []) as readonly string[],
  },
});
