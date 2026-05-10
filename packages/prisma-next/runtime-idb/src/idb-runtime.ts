import type { CodecCallContext } from "@prisma-next/framework-components/codec";
import { RuntimeCore, type QueryPlan, type RuntimeMiddlewareContext } from "@prisma-next/framework-components/runtime";
import type { IdbRuntimeAdapterInstance } from "@prisma-next-idb/adapter-idb/runtime";
import type { IdbPlanBody, IdbRuntimeDriverInstance } from "@prisma-next-idb/driver-idb/runtime";
import type { IdbMiddleware } from "./idb-middleware";

/**
 * Options for creating an IDB runtime instance.
 *
 * Phase 3 will expand this with an `ExecutionContext` (contract + codec
 * registry) once `IdbQueryPlan` and the codec aggregation layer exist.
 */
export interface IdbRuntimeOptions {
  /** Instantiated IDB adapter — provides `lower()`. */
  readonly adapter: IdbRuntimeAdapterInstance;
  /** Instantiated IDB driver — provides `execute()` and `close()`. */
  readonly driver: IdbRuntimeDriverInstance;
  /** Optional middleware chain. */
  readonly middleware?: readonly IdbMiddleware[];
  /**
   * Middleware execution context.
   *
   * Phase 3 will derive this from the contract + codec registry.
   * For now a no-op default is provided.
   */
  readonly ctx?: RuntimeMiddlewareContext;
}

/**
 * Public IDB runtime interface.
 *
 * Phase 3 will flesh this out with an `execute()` method that returns a
 * typed `AsyncIterableResult<Row>`.
 */
export interface IdbRuntime {
  close(): Promise<void>;
}

/** No-op middleware context used while the full contract layer is absent (Phase 2). */
const NOOP_CTX: RuntimeMiddlewareContext = {
  contract: null,
  mode: "permissive",
  now: () => Date.now(),
  log: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  },
};

/**
 * IDB runtime — the `RuntimeCore` subclass for IndexedDB.
 *
 * Wires together:
 * - `lower(plan, ctx)` — delegates to `adapter.lower()` to produce an `IdbPlanBody`
 * - `runDriver(exec)` — delegates to `driver.execute()` to run the plan against IDB
 * - `close()` — closes the IDB connection via `driver.close()`
 *
 * Phase 2: stubs only — `lower()` and `runDriver()` throw until Phase 3
 * provides real adapter and driver implementations.
 */
class IdbRuntimeImpl extends RuntimeCore<QueryPlan, IdbPlanBody, IdbMiddleware> implements IdbRuntime {
  readonly #adapter: IdbRuntimeAdapterInstance;
  readonly #driver: IdbRuntimeDriverInstance;

  constructor(options: IdbRuntimeOptions) {
    super({ middleware: [...(options.middleware ?? [])], ctx: options.ctx ?? NOOP_CTX });
    this.#adapter = options.adapter;
    this.#driver = options.driver;
  }

  /**
   * Lower a query plan to an IDB plan body via the adapter.
   *
   * Phase 3 provides a real `IdbAdapter` implementation.
   */
  protected override lower(plan: QueryPlan, ctx: CodecCallContext): Promise<IdbPlanBody> {
    return this.#adapter.lower(plan, ctx);
  }

  /**
   * Execute a lowered IDB plan body via the driver.
   *
   * Phase 3 provides a real `execute()` implementation on the driver.
   */
  protected override runDriver(exec: IdbPlanBody): AsyncIterable<Record<string, unknown>> {
    return this.#driver.execute(exec);
  }

  override async close(): Promise<void> {
    await this.#driver.close();
  }
}

/**
 * Create an IDB runtime instance.
 *
 * @example
 * ```ts
 * const driver = createIDBRuntimeDriver("my-app").create();
 * const runtime = createIdbRuntime({ adapter, driver });
 * // Phase 3: await runtime.execute(plan)
 * await runtime.close();
 * ```
 */
export function createIdbRuntime(options: IdbRuntimeOptions): IdbRuntime {
  return new IdbRuntimeImpl(options);
}
