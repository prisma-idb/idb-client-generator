/**
 * Sync-intercepting executor.
 *
 * Wraps any `IdbQueryExecutor` to atomically write outbox events and version
 * meta records alongside every tracked mutation. Interception happens at two
 * levels:
 *
 * 1. **Plan-level** (`execute()`): for single-store mutation plans (has an
 *    `ast`, e.g. a plain `create`/`update`/`delete` with no relations
 *    involved) the `idbPlan` body is extended into an `IdbBatchPlan` spanning
 *    the model store + both sync stores. The IDB adapter is a passthrough
 *    (`lower()` returns `plan.idbPlan` as-is), so this extended batch plan
 *    reaches the driver unmodified and executes atomically in a single IDB
 *    transaction.
 * 2. **Transaction-level** (`transaction()`): `client-idb`'s mutation
 *    executor (`mutation-executor.ts`) requires `.transaction()` for any
 *    model with a relation — FK-existence validation on create, referential
 *    actions on delete — and operates on the returned `IdbTransactionScope`
 *    directly via raw `IdbAtomicPlan`s, bypassing `execute()` entirely. See
 *    `SyncInterceptingTransactionScope` below.
 */

import type { AsyncIterableResult } from "@prisma-next/framework-components/runtime";
import type { IdbQueryExecutor, IdbQueryExecutorWithTransaction } from "@prisma-next-idb/client-idb/orm";
import type { IdbContract } from "@prisma-next-idb/client-idb/orm";
import type { IdbQueryPlan } from "@prisma-next-idb/adapter-idb/runtime";
import type {
  IdbQueryAst,
  IdbCreateAst,
  IdbDeleteAst,
  IdbUpdateAst,
  IdbUpsertAst,
  IdbCreateAllAst,
  IdbDeleteAllAst,
  IdbUpdateAllAst,
} from "@prisma-next-idb/adapter-idb/runtime";
import type {
  IdbAtomicPlan,
  IdbAddPlan,
  IdbPutPlan,
  IdbBatchPlan,
  IdbPlanBody,
  IdbTransactionScope,
} from "@prisma-next-idb/driver-idb/runtime";
import { getKeyPath, getStoreName } from "@prisma-next-idb/client-idb/orm";
import { domainModelsAtDefaultNamespace } from "@prisma-next/contract/types";
import type { OutboxEvent } from "../types";

// ── Types ─────────────────────────────────────────────────────────────────────

const OUTBOX_STORE = "_idb_sync_outbox";
const VERSION_META_STORE = "_idb_sync_version_meta";

type MutationAst =
  IdbCreateAst | IdbDeleteAst | IdbUpdateAst | IdbUpsertAst | IdbCreateAllAst | IdbDeleteAllAst | IdbUpdateAllAst;

function isMutationAst(ast: IdbQueryAst): ast is MutationAst {
  return (
    ast.kind === "create" ||
    ast.kind === "delete" ||
    ast.kind === "update" ||
    ast.kind === "upsert" ||
    ast.kind === "createAll" ||
    ast.kind === "deleteAll" ||
    ast.kind === "updateAll"
  );
}

// ── Outbox record builders ────────────────────────────────────────────────────

type OutboxRecord = OutboxEvent;

function buildOutboxRecord(
  modelName: string,
  operation: string,
  payload: unknown,
  versionMetaId: string | null
): OutboxRecord {
  return {
    id: crypto.randomUUID(),
    entityType: modelName,
    operation,
    payload,
    createdAt: new Date(),
    synced: false,
    syncedAt: null,
    lastAttemptedAt: null,
    tries: 0,
    lastError: null,
    retryable: true,
    versionMetaId,
  };
}

function outboxAddOp(
  modelName: string,
  operation: string,
  payload: unknown,
  versionMetaId: string | null,
  meta: IdbQueryPlan<unknown>["meta"]
): IdbAddPlan {
  return {
    meta,
    kind: "add",
    storeName: OUTBOX_STORE,
    record: buildOutboxRecord(modelName, operation, payload, versionMetaId) as unknown as Record<string, unknown>,
  };
}

// ── VersionMeta record builders ──────────────────────────────────────────────

function versionMetaKey(modelName: string, key: unknown): string {
  return `${modelName}::${JSON.stringify(key)}`;
}

function versionMetaPutOp(modelName: string, key: unknown, meta: IdbQueryPlan<unknown>["meta"]): IdbPutPlan {
  const id = versionMetaKey(modelName, key);
  return {
    meta,
    kind: "put",
    storeName: VERSION_META_STORE,
    record: {
      id,
      model: modelName,
      key,
      localChangePending: true,
      lastAppliedChangeId: null,
    },
  };
}

// ── Store name → model name (reverse lookup, for the transaction-scope path) ──

const storeToModelCache = new WeakMap<IdbContract, ReadonlyMap<string, string>>();

/**
 * `IdbAtomicPlan`s (used inside a transaction scope) only carry a
 * `storeName`, not a model name — unlike `IdbQueryAst`, which carries
 * `modelName` directly. Cached per contract since it's static for a given
 * contract instance.
 */
function getModelNameForStore(contract: IdbContract, storeName: string): string | undefined {
  let map = storeToModelCache.get(contract);
  if (!map) {
    const built = new Map<string, string>();
    for (const [modelName, model] of Object.entries(domainModelsAtDefaultNamespace(contract.domain))) {
      const modelStoreName = (model as { storage?: { storeName?: string } }).storage?.storeName;
      if (modelStoreName) built.set(modelStoreName, modelName);
    }
    map = built;
    storeToModelCache.set(contract, map);
  }
  return map.get(storeName);
}

/** Synthetic `PlanMeta` for ops issued directly against a transaction scope (no originating `IdbQueryPlan` to borrow one from). */
function syncPlanMeta(contract: IdbContract): IdbQueryPlan<unknown>["meta"] {
  return {
    target: "idb",
    storageHash: contract.storage.storageHash,
    lane: "idb-sync-executor",
  };
}

// ── Plan body helpers ─────────────────────────────────────────────────────────

/** Flatten an IdbPlanBody to a list of atomic ops. */
function flattenToOps(body: IdbPlanBody): IdbAtomicPlan[] {
  if (body.kind === "batch") return [...body.ops];
  return [body];
}

/** Collect all store names referenced by a plan body. */
function storeNamesOf(body: IdbPlanBody): string[] {
  if (body.kind === "batch") return [...body.storeNames];
  return [body.storeName];
}

// ── Key extraction ────────────────────────────────────────────────────────────

/**
 * `IDBKeyRange` is not structured-clonable, so it can never be written as
 * (part of) a stored record's value — only used as a request argument. Any
 * `IDBValidKey | IDBKeyRange` heading into an outbox payload must go through
 * this first: a concrete key round-trips as-is (keys are always valid,
 * clonable values), a range is flattened to its plain, cloneable bounds.
 */
function serializableKey(key: IDBValidKey | IDBKeyRange): unknown {
  if (!(key instanceof IDBKeyRange)) return key;
  return { lower: key.lower, upper: key.upper, lowerOpen: key.lowerOpen, upperOpen: key.upperOpen };
}

/**
 * Try to extract the primary key of the affected record from the plan body
 * and AST. Returns `undefined` when the key cannot be determined statically
 * (e.g. scan-write operations that match by filter, not by key).
 */
function extractKey(body: IdbPlanBody, ast: MutationAst, keyField: string): unknown {
  switch (ast.kind) {
    case "create":
      // Pull key from AST data — the codec hasn't run yet so the value is the raw JS type.
      return ast.data[keyField];
    case "delete":
      return ast.key;
    case "update":
      // IdbUpdatePlan carries the key explicitly; scan-write and batch don't.
      if (body.kind === "update") return body.key;
      return undefined;
    case "upsert":
    case "createAll":
    case "deleteAll":
    case "updateAll":
      return undefined;
    default: {
      const _exhaustive: never = ast;
      return _exhaustive;
    }
  }
}

/** Map mutation AST kind → outbox operation string. */
function outboxOperation(kind: MutationAst["kind"]): string {
  switch (kind) {
    case "create":
    case "createAll":
      return "create";
    case "delete":
    case "deleteAll":
      return "delete";
    case "update":
    case "updateAll":
      return "update";
    case "upsert":
      return "upsert";
    default: {
      const _exhaustive: never = kind;
      return String(_exhaustive);
    }
  }
}

/** Extract the payload to store in the outbox from the AST. */
function outboxPayload(ast: MutationAst): unknown {
  switch (ast.kind) {
    case "create":
      return ast.data;
    case "delete":
      return { key: ast.key };
    case "update":
      return { patch: ast.patch, where: ast.where };
    case "upsert":
      return { create: ast.create, update: ast.update, where: ast.where };
    case "createAll":
      return { data: ast.data };
    case "deleteAll":
      return { where: ast.where };
    case "updateAll":
      return { patch: ast.patch, where: ast.where };
    default: {
      const _exhaustive: never = ast;
      return _exhaustive;
    }
  }
}

// ── SyncInterceptorExecutor ───────────────────────────────────────────────────

export interface SyncInterceptorConfig {
  /** IDB contract — used to resolve store names and key paths. */
  readonly contract: IdbContract;
  /** Models to intercept. `'*'` intercepts all models. */
  readonly trackedModels: ReadonlyArray<string> | "*";
}

function isTrackedModel(config: SyncInterceptorConfig, modelName: string): boolean {
  const { trackedModels } = config;
  if (trackedModels === "*") return true;
  const storeName = getStoreName(config.contract, modelName);
  return trackedModels.includes(modelName) || trackedModels.includes(storeName);
}

/**
 * Executor wrapper that atomically extends tracked mutation plans with outbox
 * and version-meta writes.
 *
 * The IDB adapter's `lower()` is a structural passthrough, so replacing
 * `plan.idbPlan` with an extended `IdbBatchPlan` causes the driver to open
 * ONE IDB transaction spanning all stores — guaranteeing atomicity.
 */
export class SyncInterceptorExecutor implements IdbQueryExecutorWithTransaction {
  readonly #inner: IdbQueryExecutor;
  readonly #config: SyncInterceptorConfig;

  constructor(inner: IdbQueryExecutor, config: SyncInterceptorConfig) {
    this.#inner = inner;
    this.#config = config;
  }

  execute<Row>(plan: IdbQueryPlan<Row>): AsyncIterableResult<Row> {
    const ast = plan.ast;
    if (!ast || !isMutationAst(ast) || !isTrackedModel(this.#config, ast.modelName)) {
      return this.#inner.execute(plan);
    }
    return this.#inner.execute(this.#extendPlan(plan, ast));
  }

  /**
   * `client-idb`'s mutation executor requires this for any model with a
   * relation (FK-existence validation on create, referential actions on
   * delete — `requireTransactionExecutor` in `mutation-executor.ts`) and
   * operates on the returned scope via raw `IdbAtomicPlan`s, not `execute()`.
   * Delegates to the inner executor (the real `IdbRuntime`, which implements
   * this), wrapping the returned scope so ops issued against it are ALSO
   * tracked — see `SyncInterceptingTransactionScope`.
   */
  async transaction(storeNames: string[], mode?: IDBTransactionMode): Promise<IdbTransactionScope> {
    const inner = this.#inner as Partial<IdbQueryExecutorWithTransaction>;
    if (typeof inner.transaction !== "function") {
      throw new Error(
        "SyncInterceptorExecutor.transaction(): the wrapped executor does not support transactions. " +
          "Pass an IdbRuntime (createIdbRuntime), not a plain IdbQueryExecutor."
      );
    }
    const allStores = [...new Set([...storeNames, OUTBOX_STORE, VERSION_META_STORE])];
    const scope = await inner.transaction(allStores, mode);
    return new SyncInterceptingTransactionScope(scope, this.#config);
  }

  #extendPlan<Row>(plan: IdbQueryPlan<Row>, ast: MutationAst): IdbQueryPlan<Row> {
    const { contract } = this.#config;
    const modelName = ast.modelName;
    const operation = outboxOperation(ast.kind);
    const payload = outboxPayload(ast);

    // Extract the primary key of the affected record — used to key VersionMeta.
    // For operations where the key is unknowable statically (scan-writes,
    // upsert, bulk ops), extractKey returns undefined; version meta is omitted
    // but the outbox event is still written atomically.
    const key = extractKey(plan.idbPlan, ast, getKeyPath(contract, modelName));
    return this.#buildBatchPlan(plan, modelName, operation, payload, key);
  }

  #buildBatchPlan<Row>(
    plan: IdbQueryPlan<Row>,
    modelName: string,
    operation: string,
    payload: unknown,
    key: unknown
  ): IdbQueryPlan<Row> {
    const { meta } = plan;
    const originalOps = flattenToOps(plan.idbPlan);
    const originalStores = storeNamesOf(plan.idbPlan);

    const versionMetaId = key !== undefined ? versionMetaKey(modelName, key) : null;
    const extraOps: IdbAtomicPlan[] = [outboxAddOp(modelName, operation, payload, versionMetaId, meta)];
    if (key !== undefined) {
      extraOps.push(versionMetaPutOp(modelName, key, meta));
    }

    const allStores = [...originalStores, OUTBOX_STORE, ...(key !== undefined ? [VERSION_META_STORE] : [])];

    const batchPlan: IdbBatchPlan = {
      meta,
      kind: "batch",
      storeNames: [...new Set(allStores)],
      ops: [...originalOps, ...extraOps],
    };

    return { ...plan, idbPlan: batchPlan };
  }
}

// ── SyncInterceptingTransactionScope ──────────────────────────────────────────

/**
 * Wraps the real `IdbTransactionScope` `SyncInterceptorExecutor.transaction()`
 * opens, tracking every write `client-idb`'s mutation executor issues
 * directly against it (`add`, `update`, `delete`, `scan-write`) — this is
 * how `executeScalarCreateWithFkValidation`/`executeDeleteWithReferentialActions`/
 * `executeScalarUpdateWithFkValidation` (single-model writes gated by FK
 * validation or referential actions), `applyReferentialActionsForRow`
 * (cascade/setNull on children when a parent is deleted), and the nested
 * relation-mutation-callback writes (`rel.create(...)`, `rel.connect(...)`,
 * `rel.disconnect(...)` via `executeNestedCreateMutation`/
 * `executeNestedUpdateMutation`) all get covered — they all funnel through
 * this same wrapped scope, so there is nothing extra to wire up per call
 * site.
 *
 * `scan-write` (`put-merged` or `delete`) can touch 0..N rows in one
 * physical op (e.g. cascade-deleting every comment on a post). Its `filter`
 * is an opaque JS closure, not a serializable expression like the AST-level
 * `where` bulk ops (`deleteAll`/`updateAll`) get — so there is no way to
 * record "the operation" as a replayable intent. Instead, `execScanWrite`
 * (`driver-idb/src/core/execute/ops.ts`) already collects and returns every
 * row it actually touched (the merged row for `put-merged`, the pre-delete
 * snapshot for `delete`) as this op's resolved value; one outbox event +
 * one VersionMeta row is written per affected row, keyed by that row's own
 * primary key — the same shape as a normal single-row update/delete.
 */
class SyncInterceptingTransactionScope implements IdbTransactionScope {
  readonly #inner: IdbTransactionScope;
  readonly #config: SyncInterceptorConfig;

  constructor(inner: IdbTransactionScope, config: SyncInterceptorConfig) {
    this.#inner = inner;
    this.#config = config;
  }

  async execute(plan: IdbAtomicPlan): Promise<Record<string, unknown>[]> {
    const rows = await this.#inner.execute(plan);
    await this.#maybeTrack(plan, rows);
    return rows;
  }

  commit(): Promise<void> {
    return this.#inner.commit();
  }

  rollback(): void {
    this.#inner.rollback();
  }

  async #maybeTrack(plan: IdbAtomicPlan, rows: Record<string, unknown>[]): Promise<void> {
    const { contract } = this.#config;
    const modelName = getModelNameForStore(contract, plan.storeName);
    if (!modelName || !isTrackedModel(this.#config, modelName)) return;
    const keyPath = getKeyPath(contract, modelName);

    switch (plan.kind) {
      case "add": {
        const record = plan.record;
        await this.#writeOutboxAndMeta(modelName, "create", record, record[keyPath]);
        return;
      }
      case "delete": {
        // `key` can be a range for bulk deletes; only a concrete IDBValidKey
        // is usable for VersionMeta (the outbox event is still written
        // either way). IDBKeyRange itself is not structured-clonable, so it
        // can't be stored raw inside the outbox record's payload either —
        // normalize it to plain, cloneable bounds first.
        const key = plan.key instanceof IDBKeyRange ? undefined : plan.key;
        await this.#writeOutboxAndMeta(modelName, "delete", { key: serializableKey(plan.key) }, key);
        return;
      }
      case "update": {
        const merged = rows[0];
        if (!merged) return;
        await this.#writeOutboxAndMeta(modelName, "update", { patch: plan.patch, key: plan.key }, merged[keyPath]);
        return;
      }
      case "scan-write": {
        const operation = plan.write === "delete" ? "delete" : "update";
        for (const row of rows) {
          const key = row[keyPath];
          const payload = plan.write === "delete" ? { key } : { patch: plan.patch, key };
          await this.#writeOutboxAndMeta(modelName, operation, payload, key);
        }
        return;
      }
      // `put` is untracked: `client-idb`'s mutation executor never issues it
      // against a live transaction scope for tracked-model writes today
      // (only this file's own outbox/version-meta bookkeeping does, which
      // bypasses `execute()` via `#writeOutboxAndMeta` and never reaches
      // here). Reads are never tracked.
      case "put":
      case "key-get":
      case "index-get":
      case "cursor-scan":
        return;
      default: {
        const _exhaustive: never = plan;
        return _exhaustive;
      }
    }
  }

  async #writeOutboxAndMeta(modelName: string, operation: string, payload: unknown, key: unknown): Promise<void> {
    const meta = syncPlanMeta(this.#config.contract);
    const versionMetaId = key !== undefined ? versionMetaKey(modelName, key) : null;
    await this.#inner.execute(outboxAddOp(modelName, operation, payload, versionMetaId, meta));
    if (key !== undefined) {
      await this.#inner.execute(versionMetaPutOp(modelName, key, meta));
    }
  }
}
