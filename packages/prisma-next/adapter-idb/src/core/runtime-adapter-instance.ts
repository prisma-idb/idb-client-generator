import type { CodecCallContext } from "@prisma-next/framework-components/codec";
import type { RuntimeAdapterInstance } from "@prisma-next/framework-components/execution";
import type { QueryPlan } from "@prisma-next/framework-components/runtime";
import type { IdbPlanBody } from "@prisma-next-idb/driver-idb/runtime";

/**
 * Runtime adapter instance for IndexedDB.
 *
 * Extends the generic `RuntimeAdapterInstance` marker with the IDB-specific
 * `lower()` method. `lower()` is the core of the adapter: it translates a
 * high-level `QueryPlan` (Prisma query AST + meta) into an `IdbPlanBody`
 * (one of the strongly-typed IDB operation plans) that the driver can execute
 * directly against `window.indexedDB`.
 *
 * Phase 3 provides a concrete implementation. This interface exists in Phase 2
 * so the runtime package (`@prisma-next-idb/runtime-idb`) has a stable contract
 * to depend on when building `IdbRuntimeImpl`.
 */
export interface IdbRuntimeAdapterInstance extends RuntimeAdapterInstance<"idb", "idb"> {
  /**
   * Lower a Prisma query plan to an IDB execution plan.
   *
   * @param plan - The high-level query plan from a Prisma lane (contains
   *   the query AST and plan metadata, but no IDB-specific operations).
   * @param ctx  - Codec call context forwarded from the runtime. Carries an
   *   optional `AbortSignal` for cooperative cancellation.
   * @returns The IDB plan body describing the exact IDB operation(s) to run.
   */
  lower(plan: QueryPlan, ctx: CodecCallContext): Promise<IdbPlanBody>;
}
