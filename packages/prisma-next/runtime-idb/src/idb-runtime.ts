import type { CodecCallContext } from "@prisma-next/framework-components/codec";
import {
  AsyncIterableResult,
  RuntimeCore,
  type RuntimeExecuteOptions,
  type RuntimeMiddlewareContext,
} from "@prisma-next/framework-components/runtime";
import type { IdbQueryPlan, IdbRuntimeAdapterInstance } from "@prisma-next-idb/adapter-idb/runtime";
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
 * `execute()` accepts an {@link IdbQueryPlan} and returns an
 * `AsyncIterableResult<Row>` — an async iterable that also fulfils as a
 * `Row[]` when awaited. Phase 3b delivers the first real implementation.
 */
export interface IdbRuntime {
  execute<Row>(plan: IdbQueryPlan & { readonly _row?: Row }, options?: RuntimeExecuteOptions): AsyncIterableResult<Row>;
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
 * - `execute()` — the concrete template method from `RuntimeCore`; overridden to
 *   satisfy the `IdbRuntime` interface type (identity decode, Phase 4 adds per-field
 *   codec decoding via `IdbExecutionContext`)
 * - `close()` — closes the IDB connection via `driver.close()`
 */
class IdbRuntimeImpl extends RuntimeCore<IdbQueryPlan, IdbPlanBody, IdbMiddleware> implements IdbRuntime {
  readonly #adapter: IdbRuntimeAdapterInstance;
  readonly #driver: IdbRuntimeDriverInstance;

  constructor(options: IdbRuntimeOptions) {
    super({ middleware: [...(options.middleware ?? [])], ctx: options.ctx ?? NOOP_CTX });
    this.#adapter = options.adapter;
    this.#driver = options.driver;
  }

  /**
   * Lower an IDB query plan to an IDB plan body via the adapter.
   *
   * Phase 3b: delegates to `IdbAdapter.lower()` which is a structural
   * passthrough (Phase 4 adds per-field codec encoding).
   */
  protected override lower(plan: IdbQueryPlan, ctx: CodecCallContext): Promise<IdbPlanBody> {
    return this.#adapter.lower(plan, ctx);
  }

  /**
   * Execute a lowered IDB plan body via the driver.
   */
  protected override runDriver(exec: IdbPlanBody): AsyncIterable<Record<string, unknown>> {
    return this.#driver.execute(exec);
  }

  /**
   * Execute an IDB query plan and return a typed async-iterable result.
   *
   * Phase 3b: rows are yielded as-is from the driver (identity pass-through).
   * All current `idb/*` codecs are identity transforms — no per-field
   * decoding is needed.
   *
   * Phase 4 will add per-field codec decoding here when `IdbExecutionContext`
   * provides the per-store field→codec schema (e.g. decoding `idb/date@1`
   * stored values back to `Date` instances, or custom codec output types).
   */
  override execute<Row>(
    plan: IdbQueryPlan & { readonly _row?: Row },
    options?: RuntimeExecuteOptions
  ): AsyncIterableResult<Row> {
    return super.execute(plan, options);
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
