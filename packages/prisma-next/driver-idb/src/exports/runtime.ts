import type { RuntimeDriverDescriptor } from "@prisma-next/framework-components/execution";
import { idbDriverDescriptorMeta } from "../core/descriptor-meta";
import { IdbRuntimeDriverInstance } from "../core/idb-driver";

export type {
  IdbPlanBody,
  IdbAtomicPlan,
  IdbBatchPlan,
  IdbCursorScanPlan,
  IdbKeyGetPlan,
  IdbIndexGetPlan,
  IdbPutPlan,
  IdbUpdatePlan,
  IdbDeletePlan,
  IdbRowFilter,
  IdbRowComparator,
} from "../core/plan-body";
export type { IdbRuntimeDriverInstance } from "../core/idb-driver";
export { IdbExecuteError } from "../core/execute/error";
export type { IdbExecuteErrorCode } from "../core/execute/error";

/**
 * Creates a runtime driver descriptor for IndexedDB.
 *
 * The returned descriptor's `create()` opens the named IDB database
 * lazily — the connection resolves in the background and is awaited by
 * the adapter inside `runDriver()` for the first query.
 *
 * @param dbName  - The IDB database name to open.
 * @param version - The IDB version number (default: 1). Phase 5 will use this
 *   to trigger `upgradeneeded`-based migrations when the version is bumped.
 *
 * @example
 * ```ts
 * const stack = createRuntimeStack({
 *   target:  idbRuntimeTargetDescriptor,
 *   adapter: idbRuntimeAdapterDescriptor,
 *   driver:  createIDBRuntimeDriver("my-app"),
 * });
 * ```
 */
export function createIDBRuntimeDriver(
  dbName: string,
  version = 1
): RuntimeDriverDescriptor<"idb", "idb", void, IdbRuntimeDriverInstance> {
  return {
    ...idbDriverDescriptorMeta,
    create(): IdbRuntimeDriverInstance {
      return new IdbRuntimeDriverInstance(dbName, version);
    },
  };
}
