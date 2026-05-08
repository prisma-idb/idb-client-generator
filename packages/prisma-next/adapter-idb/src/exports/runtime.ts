import type {
  RuntimeAdapterDescriptor,
  RuntimeAdapterInstance,
  ExecutionStack,
} from "@prisma-next/framework-components/execution";
import { idbAdapterDescriptorMeta } from "../core/descriptor-meta";

const idbRuntimeAdapterDescriptor: RuntimeAdapterDescriptor<"idb", "idb"> = {
  ...idbAdapterDescriptorMeta,
  create(_stack: ExecutionStack<"idb", "idb">): RuntimeAdapterInstance<"idb", "idb"> {
    return { familyId: "idb", targetId: "idb" };
  },
};

export default idbRuntimeAdapterDescriptor;
