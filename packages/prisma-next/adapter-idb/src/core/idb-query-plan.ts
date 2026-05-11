import type { QueryPlan } from "@prisma-next/framework-components/runtime";
import type { IdbPlanBody } from "@prisma-next-idb/driver-idb/runtime";

// Unique symbol for row phantom-type brand (mirrors MongoQueryPlan's pattern).
declare const __idbQueryPlanRow: unique symbol;

/**
 * IDB pre-lowering query plan produced by lanes before lowering.
 *
 * Extends the framework-level {@link QueryPlan}<Row> marker (`meta + _row`) and
 * adds the IDB execution plan as `idbPlan`. Because IDB has no query language
 * of its own, the plan already carries the execution-ready {@link IdbPlanBody}
 * — there is no AST compilation step as in SQL. The adapter's `lower()` step
 * handles codec encoding of field values (Phase 4) and returns the
 * (possibly re-encoded) `IdbPlanBody` to the driver.
 *
 * @template Row - The TypeScript row shape inferred from the lane builder.
 *   Phantom-typed: never read at runtime, but constrains the return type of
 *   `runtime.execute()`.
 */
export interface IdbQueryPlan<Row = unknown> extends QueryPlan<Row> {
  /** The execution-ready IDB plan produced by the lane builder. */
  readonly idbPlan: IdbPlanBody;
  /** Phantom row brand — matches the `_row` slot on the base QueryPlan. */
  readonly [__idbQueryPlanRow]?: Row;
}
