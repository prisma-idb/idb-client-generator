import type { AsyncIterableResult } from "@prisma-next/framework-components/runtime";
import type { IdbQueryPlan } from "@prisma-next-idb/adapter-idb/runtime";

/**
 * Thin executor interface for the IDB ORM client.
 *
 * Any object with a compatible `execute()` method satisfies this interface,
 * including `IdbRuntime` from `@prisma-next-idb/runtime-idb`. The separation
 * avoids a direct dependency on `runtime-idb`, keeping `client-idb` composable
 * and independently testable.
 *
 * @example
 * ```ts
 * import { createIdbRuntime } from "@prisma-next-idb/runtime-idb/runtime";
 * const runtime = createIdbRuntime({ adapter, driver });
 * const client = idbOrm({ contract, executor: runtime }); // runtime satisfies IdbQueryExecutor
 * ```
 */
export interface IdbQueryExecutor {
  execute<Row>(plan: IdbQueryPlan<Row>): AsyncIterableResult<Row>;
}
