import type { RuntimeMiddleware } from "@prisma-next/framework-components/runtime";
import type { IdbPlanBody } from "@prisma-next-idb/driver-idb/runtime";

/**
 * IDB-family middleware.
 *
 * Extends the generic `RuntimeMiddleware<IdbPlanBody>` marker with the `family`
 * discriminant so the runtime can verify that only IDB-compatible middleware
 * is registered on an IDB runtime instance.
 *
 * ## `onRow` backpressure limitation
 *
 * Unlike SQL/Mongo drivers, the IDB driver uses collect-then-yield: all rows
 * are materialized inside the IDB transaction before any are delivered to the
 * middleware pipeline (see ADR 006). This means:
 *
 * - `onRow` fires after the full cursor scan has completed and all rows are in
 *   memory. Throwing or aborting inside `onRow` does NOT reduce the number of
 *   rows read from the object store.
 * - Use `take(n)` on the query builder to bound materialization, not early
 *   exit from `onRow`.
 * - Observation-only hooks (telemetry, cache population, logging) work
 *   correctly — they just receive rows from an already-complete scan.
 */
export interface IdbMiddleware extends RuntimeMiddleware<IdbPlanBody> {
  readonly family: "idb";
}
