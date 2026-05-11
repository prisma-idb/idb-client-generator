import type { CodecCallContext } from "@prisma-next/framework-components/codec";
import type { RuntimeAdapterInstance } from "@prisma-next/framework-components/execution";
import type { IdbPlanBody } from "@prisma-next-idb/driver-idb/runtime";
import type { IdbQueryPlan } from "./idb-query-plan";

/**
 * Runtime adapter instance for IndexedDB.
 *
 * Extends the generic `RuntimeAdapterInstance` marker with the IDB-specific
 * `lower()` method. `lower()` is the core of the adapter: it translates an
 * {@link IdbQueryPlan} (IDB execution plan + meta) into an {@link IdbPlanBody}
 * (one of the strongly-typed IDB operation plans) that the driver can execute
 * directly against `window.indexedDB`.
 *
 * Phase 3b provides a concrete implementation ({@link import('./idb-adapter').IdbAdapter}).
 * This interface exists so `runtime-idb` has a stable contract to depend on
 * when building `IdbRuntimeImpl`.
 */
export interface IdbRuntimeAdapterInstance extends RuntimeAdapterInstance<"idb", "idb"> {
  /**
   * Lower an IDB query plan to an IDB execution plan.
   *
   * @param plan - The pre-lowering query plan from a Prisma lane. Carries the
   *   execution-ready `IdbPlanBody` plus plan metadata.
   * @param ctx  - Codec call context forwarded from the runtime. Carries an
   *   optional `AbortSignal` for cooperative cancellation. Phase 4 uses this
   *   to cancel in-flight async codec.encode() calls.
   * @returns The IDB plan body describing the exact IDB operation(s) to run.
   */
  lower(plan: IdbQueryPlan, ctx: CodecCallContext): Promise<IdbPlanBody>;
}
