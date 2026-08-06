/**
 * Sync-intercepting executor.
 *
 * Wraps any `IdbQueryExecutor` to atomically write outbox events and version
 * meta records alongside every tracked mutation. Interception happens at the
 * `IdbQueryPlan` level: for mutation plans the `idbPlan` body is extended into
 * an `IdbBatchPlan` spanning the model store + both sync stores. The IDB
 * adapter is a passthrough (`lower()` returns `plan.idbPlan` as-is), so this
 * extended batch plan reaches the driver unmodified and executes atomically in
 * a single IDB transaction.
 */

import type { AsyncIterableResult } from "@prisma-next/framework-components/runtime";
import type { IdbQueryExecutor } from "@prisma-next-idb/client-idb/orm";
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
} from "@prisma-next-idb/driver-idb/runtime";
import { getKeyPath, getStoreName } from "@prisma-next-idb/client-idb/orm";

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

interface OutboxRecord {
  id: string;
  entityType: string;
  operation: string;
  payload: unknown;
  createdAt: Date;
  synced: boolean;
  syncedAt: null;
  lastAttemptedAt: null;
  tries: number;
  lastError: null;
  retryable: boolean;
}

function buildOutboxRecord(modelName: string, operation: string, payload: unknown): OutboxRecord {
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
  };
}

function outboxAddOp(
  modelName: string,
  operation: string,
  payload: unknown,
  meta: IdbQueryPlan<unknown>["meta"]
): IdbAddPlan {
  return {
    meta,
    kind: "add",
    storeName: OUTBOX_STORE,
    record: buildOutboxRecord(modelName, operation, payload) as unknown as Record<string, unknown>,
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

/**
 * Executor wrapper that atomically extends tracked mutation plans with outbox
 * and version-meta writes.
 *
 * The IDB adapter's `lower()` is a structural passthrough, so replacing
 * `plan.idbPlan` with an extended `IdbBatchPlan` causes the driver to open
 * ONE IDB transaction spanning all stores — guaranteeing atomicity.
 */
export class SyncInterceptorExecutor implements IdbQueryExecutor {
  readonly #inner: IdbQueryExecutor;
  readonly #config: SyncInterceptorConfig;

  constructor(inner: IdbQueryExecutor, config: SyncInterceptorConfig) {
    this.#inner = inner;
    this.#config = config;
  }

  execute<Row>(plan: IdbQueryPlan<Row>): AsyncIterableResult<Row> {
    const ast = plan.ast;
    if (!ast || !isMutationAst(ast) || !this.#isTracked(ast.modelName)) {
      return this.#inner.execute(plan);
    }
    return this.#inner.execute(this.#extendPlan(plan, ast));
  }

  #isTracked(modelName: string): boolean {
    const { trackedModels } = this.#config;
    if (trackedModels === "*") return true;
    const storeName = getStoreName(this.#config.contract, modelName);
    return trackedModels.includes(modelName) || trackedModels.includes(storeName);
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

    const extraOps: IdbAtomicPlan[] = [outboxAddOp(modelName, operation, payload, meta)];
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
