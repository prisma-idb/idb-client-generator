import type { RuntimeTargetDescriptor, RuntimeTargetInstance } from "@prisma-next/framework-components/execution";
import { idbTargetDescriptorMeta } from "../core/descriptor-meta";

export type IdbRuntimeTargetInstance = RuntimeTargetInstance<"idb", "idb">;

const idbRuntimeTargetDescriptor: RuntimeTargetDescriptor<"idb", "idb", IdbRuntimeTargetInstance> = {
  ...idbTargetDescriptorMeta,
  create(): IdbRuntimeTargetInstance {
    return {
      familyId: "idb",
      targetId: "idb",
    };
  },
};

export default idbRuntimeTargetDescriptor;
