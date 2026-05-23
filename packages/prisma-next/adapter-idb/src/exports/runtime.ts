import type { RuntimeAdapterDescriptor, ExecutionStack } from "@prisma-next/framework-components/execution";
import { emptyCodecLookup } from "@prisma-next/framework-components/codec";
import { idbAdapterDescriptorMeta } from "../core/descriptor-meta";
import { IdbAdapter } from "../core/idb-adapter";
import type { IdbRuntimeAdapterInstance } from "../core/runtime-adapter-instance";

export type { IdbRuntimeAdapterInstance, IdbLowererContext } from "../core/runtime-adapter-instance";
export type { IdbQueryPlan } from "../core/idb-query-plan";
export type { IdbQueryAst, IdbFindManyAst, IdbFindUniqueAst, IdbCreateAst, IdbDeleteAst } from "../core/idb-query-ast";
export { IdbAdapter } from "../core/idb-adapter";

const idbRuntimeAdapterDescriptor: RuntimeAdapterDescriptor<"idb", "idb", IdbRuntimeAdapterInstance> = {
  ...idbAdapterDescriptorMeta,
  create(_stack: ExecutionStack<"idb", "idb">): IdbRuntimeAdapterInstance {
    // Create a passthrough IdbAdapter with an empty codec lookup.
    // When per-field codec encoding is needed, thread the codec registry
    // and schema from the execution stack so lower() can encode field values.
    return new IdbAdapter(emptyCodecLookup);
  },
};

export default idbRuntimeAdapterDescriptor;
