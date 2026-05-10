import type { RuntimeMiddleware } from "@prisma-next/framework-components/runtime";
import type { IdbPlanBody } from "@prisma-next-idb/driver-idb/runtime";

/**
 * IDB-family middleware.
 *
 * Extends the generic `RuntimeMiddleware<IdbPlanBody>` marker with the `family`
 * discriminant so the runtime can verify that only IDB-compatible middleware
 * is registered on an IDB runtime instance.
 *
 * Phase 3 will add IDB-specific middleware hooks (e.g. query budgets,
 * cursor-scan guardrails, audit logging).
 */
export interface IdbMiddleware extends RuntimeMiddleware<IdbPlanBody> {
  readonly family: "idb";
}
