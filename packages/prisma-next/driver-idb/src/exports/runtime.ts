import type { RuntimeDriverDescriptor, RuntimeDriverInstance } from "@prisma-next/framework-components/execution";
import { idbDriverDescriptorMeta } from "../core/descriptor-meta";

const idbRuntimeDriverDescriptor: RuntimeDriverDescriptor<"idb", "idb"> = {
  ...idbDriverDescriptorMeta,
  create(): RuntimeDriverInstance<"idb", "idb"> {
    // TODO: return real IDBDatabase-backed driver
    return { familyId: "idb", targetId: "idb" };
  },
};

export default idbRuntimeDriverDescriptor;
