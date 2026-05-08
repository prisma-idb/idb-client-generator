import type { ControlTargetDescriptor, ControlTargetInstance } from "@prisma-next/framework-components/control";
import { idbTargetDescriptorMeta } from "../core/descriptor-meta";

const idbControlTargetDescription = {
  ...idbTargetDescriptorMeta,
  create(): ControlTargetInstance<"idb", "idb"> {
    return { familyId: "idb", targetId: "idb" };
  },
} as const satisfies ControlTargetDescriptor<"idb", "idb">;

export default idbControlTargetDescription;
