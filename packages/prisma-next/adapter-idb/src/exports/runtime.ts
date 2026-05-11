import type { RuntimeAdapterDescriptor, ExecutionStack } from "@prisma-next/framework-components/execution";
import { emptyCodecLookup } from "@prisma-next/framework-components/codec";
import { idbAdapterDescriptorMeta } from "../core/descriptor-meta";
import { IdbAdapter } from "../core/idb-adapter";
import type { IdbRuntimeAdapterInstance } from "../core/runtime-adapter-instance";

export type { IdbRuntimeAdapterInstance } from "../core/runtime-adapter-instance";
export type { IdbQueryPlan } from "../core/idb-query-plan";
export { IdbAdapter } from "../core/idb-adapter";

const idbRuntimeAdapterDescriptor: RuntimeAdapterDescriptor<"idb", "idb", IdbRuntimeAdapterInstance> = {
  ...idbAdapterDescriptorMeta,
  create(_stack: ExecutionStack<"idb", "idb">): IdbRuntimeAdapterInstance {
    // Phase 3b: create a passthrough IdbAdapter with an empty codec lookup.
    // Phase 4 will thread the codec registry + schema from the execution
    // stack (via IdbExecutionContext) so lower() can encode field values.
    return new IdbAdapter(emptyCodecLookup);
  },
};

export default idbRuntimeAdapterDescriptor;
