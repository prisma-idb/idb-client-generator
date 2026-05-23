import type { CodecCallContext } from "@prisma-next/framework-components/codec";
import {
  AsyncIterableResult,
  RuntimeCore,
  type RuntimeExecuteOptions,
  type RuntimeMiddlewareContext,
} from "@prisma-next/framework-components/runtime";
import type { IdbLowererContext, IdbQueryPlan, IdbRuntimeAdapterInstance } from "@prisma-next-idb/adapter-idb/runtime";
import type { IdbPlanBody, IdbRuntimeDriverInstance } from "@prisma-next-idb/driver-idb/runtime";
import type { IdbMiddleware } from "./idb-middleware";

/**
 * Options for creating an IDB runtime instance.
 */
export interface IdbRuntimeOptions {
  /** Instantiated IDB adapter — provides `lower()`. */
  readonly adapter: IdbRuntimeAdapterInstance;
  /** Instantiated IDB driver — provides `execute()` and `close()`. */
  readonly driver: IdbRuntimeDriverInstance;
  /**
   * The resolved IDB contract.
   *
   * Threaded through to the adapter's `lower()` as part of
   * {@link IdbLowererContext} so per-field codec encoding can
   * resolve field→codec mappings from the storage schema. Also used
   * to build the real {@link RuntimeMiddlewareContext} so middleware
   * can inspect contract data.
   */
  readonly contract: Record<string, unknown>;
  /** Optional middleware chain. */
  readonly middleware?: readonly IdbMiddleware[];
  /**
   * Middleware execution context.
   *
   * When omitted, a real context is derived from `contract`.
   */
  readonly ctx?: RuntimeMiddlewareContext;
}

/**
 * Public IDB runtime interface.
 *
 * `execute()` accepts an {@link IdbQueryPlan} and returns an
 * `AsyncIterableResult<Row>` — an async iterable that also fulfils as a
 * `Row[]` when awaited.
 */
export interface IdbRuntime {
  execute<Row>(plan: IdbQueryPlan & { readonly _row?: Row }, options?: RuntimeExecuteOptions): AsyncIterableResult<Row>;
  /**
   * Verify that the live IDB database's contract marker matches the
   * contract this runtime was created with.
   *
   * Reads the `_prisma_next_marker` store and compares the stored
   * `storageHash` against the contract's `storage.storageHash`.
   * Returns `true` when the marker exists and matches, `false` when
   * the marker is absent or mismatched.
   *
   * Call this after construction and before executing queries to
   * detect schema drift. A missing marker means the database was
   * never initialised (run `db migrate` first). A mismatched marker
   * means the database schema has diverged from the contract.
   */
  verifyMarker(): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * Build a real {@link RuntimeMiddlewareContext} from the contract
 * so middleware can inspect contract data (plan meta hashes, model
 * names, storage layout).
 */
function buildMiddlewareContext(contract: Record<string, unknown>): RuntimeMiddlewareContext {
  return {
    contract,
    mode: "permissive",
    now: () => Date.now(),
    log: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
  };
}

/**
 * IDB runtime — the `RuntimeCore` subclass for IndexedDB.
 *
 * Wires together:
 * - `lower(plan, ctx)` — delegates to `adapter.lower()` with the contract
 *   threaded via {@link IdbLowererContext}, producing an `IdbPlanBody`
 * - `runDriver(exec)` — delegates to `driver.execute()` to run the plan against IDB
 * - `execute()` — the concrete template method from `RuntimeCore`
 * - `close()` — closes the IDB connection via `driver.close()`
 */
class IdbRuntimeImpl extends RuntimeCore<IdbQueryPlan, IdbPlanBody, IdbMiddleware> implements IdbRuntime {
  readonly #adapter: IdbRuntimeAdapterInstance;
  readonly #driver: IdbRuntimeDriverInstance;
  readonly #contract: Record<string, unknown>;

  constructor(options: IdbRuntimeOptions) {
    const ctx = options.ctx ?? buildMiddlewareContext(options.contract);
    super({ middleware: [...(options.middleware ?? [])], ctx });
    this.#adapter = options.adapter;
    this.#driver = options.driver;
    this.#contract = options.contract;
  }

  /**
   * Lower an IDB query plan to an IDB plan body via the adapter.
   *
   * Threads the contract through {@link IdbLowererContext} so per-field
   * codec encoding can resolve field→codec mappings from the contract's
   * storage schema.
   */
  protected override lower(plan: IdbQueryPlan, ctx: CodecCallContext): Promise<IdbPlanBody> {
    const lowererCtx: IdbLowererContext = {
      ...ctx,
      contract: this.#contract,
    };
    return this.#adapter.lower(plan, lowererCtx);
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
   * Rows are yielded as-is from the driver (identity pass-through).
   * All current `idb/*` codecs are identity transforms — no per-field
   * decoding is needed. When per-field codec decoding is added (e.g.
   * decoding `idb/date@1` stored values back to `Date` instances, or
   * custom codec output types), it wires up here.
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

  /**
   * Verify that the live IDB marker matches the contract.
   *
   * Compares the stored `storageHash` against `contract.storage.storageHash`.
   * A fresh database (no marker store) returns `false` — the caller should
   * ensure migrations have been applied before running queries.
   */
  async verifyMarker(): Promise<boolean> {
    const marker = await this.#driver.readMarker();
    if (marker === null) return false;
    const contractStorage = this.#contract["storage"] as Record<string, unknown> | undefined;
    const contractHash = contractStorage?.["storageHash"];
    return typeof contractHash === "string" && marker.storageHash === contractHash;
  }
}

/**
 * Create an IDB runtime instance.
 *
 * @example
 * ```ts
 * const driver = createIDBRuntimeDriver("my-app").create();
 * const runtime = createIdbRuntime({ adapter, driver, contract });
 * await runtime.execute(plan)
 * await runtime.close();
 * ```
 */
export function createIdbRuntime(options: IdbRuntimeOptions): IdbRuntime {
  return new IdbRuntimeImpl(options);
}
