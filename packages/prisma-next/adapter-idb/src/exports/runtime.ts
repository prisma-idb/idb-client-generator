import type { RuntimeAdapterDescriptor, ExecutionStack } from "@prisma-next/framework-components/execution";
import { idbAdapterDescriptorMeta } from "../core/descriptor-meta";
import type { IdbRuntimeAdapterInstance } from "../core/runtime-adapter-instance";

export type { IdbRuntimeAdapterInstance } from "../core/runtime-adapter-instance";

const idbRuntimeAdapterDescriptor: RuntimeAdapterDescriptor<"idb", "idb", IdbRuntimeAdapterInstance> = {
  ...idbAdapterDescriptorMeta,
  create(_stack: ExecutionStack<"idb", "idb">): IdbRuntimeAdapterInstance {
    // Phase 3 — return a real IdbAdapter instance that implements lower().
    throw new Error("IDB adapter create() not yet implemented — Phase 3");
  },
};

export default idbRuntimeAdapterDescriptor;
