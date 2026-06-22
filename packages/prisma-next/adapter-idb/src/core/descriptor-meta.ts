import type { AdapterDescriptor } from "@prisma-next/framework-components/components";

export const idbAdapterDescriptorMeta = {
  kind: "adapter",
  familyId: "idb",
  targetId: "idb",
  id: "idb",
  version: "0.0.1",
  capabilities: {
    idb: {
      /** IDB's `upgradeneeded` callback IS a version-change transaction. */
      transactionalDDL: true,
      /** DDL can ONLY run inside `upgradeneeded` — never at query time. */
      ddlOnlyInUpgrade: true,
      /** IDB has no RETURNING clause. */
      returning: false,
      /** Compound keys are forbidden by sync ownership invariants. */
      compoundKeys: false,
    },
  },
  scalarTypeDescriptors: new Map([
    ["String", "idb/string@1"],
    ["Int", "idb/int32@1"],
    ["Float", "idb/double@1"],
    ["Boolean", "idb/bool@1"],
    ["DateTime", "idb/date@1"],
    ["BigInt", "idb/bigint@1"],
    ["Decimal", "idb/decimal@1"],
    ["Json", "idb/json@1"],
    ["Bytes", "idb/bytes@1"],
  ]),
} satisfies AdapterDescriptor<"idb", "idb">;
