import type { AdapterDescriptor } from "@prisma-next/framework-components/components";

export const idbAdapterDescriptorMeta = {
  kind: "adapter",
  familyId: "idb",
  targetId: "idb",
  id: "idb",
  version: "0.0.1",
  capabilities: {},
} as const satisfies AdapterDescriptor<"idb", "idb">;
