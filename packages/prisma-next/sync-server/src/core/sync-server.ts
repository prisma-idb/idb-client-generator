import { domainModelsAtDefaultNamespace } from "@prisma-next/contract/types";
import type { IdbModelStorage } from "@prisma-next-idb/target-idb/pack";
import { resolveAuthorizationPaths } from "./authorization-paths";
import { buildOwnershipDag } from "./ownership-dag";
import type { OwnershipDag, SyncServerContract } from "./ownership-dag";

/** An outbox event pending push, transport-agnostic (no browser types). */
export interface SyncPushEvent {
  readonly id: string;
  readonly model: string;
  readonly operation: "create" | "update" | "delete";
  readonly payload: Record<string, unknown>;
}

/** A changelog row pending pull; `key` is the row's own primary-key value. */
export interface SyncPullLogEntry {
  readonly changelogId: string;
  readonly model: string;
  readonly key: unknown;
}

/**
 * What the caller must check to authorize a record. Never a query result —
 * `sync-server` never touches a database (ADR 014's transport-agnostic
 * boundary). The caller executes the check against whatever storage it uses.
 */
export type OwnershipCheck =
  | { readonly kind: "unknown-model" }
  | {
      readonly kind: "root";
      readonly keyField: string;
      readonly key: unknown;
      readonly scopeKey: string;
      /** The row *is* the root — no query needed, this is already decided. */
      readonly authorized: boolean;
    }
  | {
      readonly kind: "scoped";
      readonly keyField: string;
      readonly key: unknown;
      readonly rootKeyField: string;
      readonly scopeKey: string;
      /**
       * Every relation-name chain from this model to `rootModel`. The
       * caller is authorized via *any one* resolving to `scopeKey`
       * (ADR 014) — e.g. `findFirst` with an `OR` across paths.
       */
      readonly paths: readonly (readonly string[])[];
    };

export interface PushValidationResult {
  readonly eventId: string;
  readonly model: string;
  readonly check: OwnershipCheck;
}

export interface PullScopeResult {
  readonly changelogId: string;
  readonly model: string;
  readonly check: OwnershipCheck;
}

function getKeyField(contract: SyncServerContract, modelName: string): string {
  const model = domainModelsAtDefaultNamespace(contract.domain)[modelName];
  const storage = model?.storage as IdbModelStorage | undefined;
  if (!storage?.keyPath) {
    throw new Error(`Model "${modelName}" has no storage.keyPath in the contract.`);
  }
  return storage.keyPath;
}

function buildOwnershipCheck(
  dag: OwnershipDag,
  contract: SyncServerContract,
  modelName: string,
  keyField: string,
  key: unknown,
  scopeKey: string
): OwnershipCheck {
  if (modelName === dag.rootModel) {
    return { kind: "root", keyField, key, scopeKey, authorized: key === scopeKey };
  }
  return {
    kind: "scoped",
    keyField,
    key,
    rootKeyField: getKeyField(contract, dag.rootModel),
    scopeKey,
    paths: resolveAuthorizationPaths(contract, dag.rootModel, modelName),
  };
}

export function validatePush(
  dag: OwnershipDag,
  contract: SyncServerContract,
  events: readonly SyncPushEvent[],
  options: { readonly scopeKey: string }
): readonly PushValidationResult[] {
  const models = domainModelsAtDefaultNamespace(contract.domain);

  return events.map((event) => {
    if (!dag.clientModels.has(event.model) || !models[event.model]) {
      return { eventId: event.id, model: event.model, check: { kind: "unknown-model" } };
    }
    const keyField = getKeyField(contract, event.model);
    const check = buildOwnershipCheck(dag, contract, event.model, keyField, event.payload[keyField], options.scopeKey);
    return { eventId: event.id, model: event.model, check };
  });
}

export function buildPullQueries(
  dag: OwnershipDag,
  contract: SyncServerContract,
  logs: readonly SyncPullLogEntry[],
  options: { readonly scopeKey: string }
): readonly PullScopeResult[] {
  const models = domainModelsAtDefaultNamespace(contract.domain);

  return logs.map((log) => {
    if (!dag.clientModels.has(log.model) || !models[log.model]) {
      return { changelogId: log.changelogId, model: log.model, check: { kind: "unknown-model" } };
    }
    const keyField = getKeyField(contract, log.model);
    const check = buildOwnershipCheck(dag, contract, log.model, keyField, log.key, options.scopeKey);
    return { changelogId: log.changelogId, model: log.model, check };
  });
}

export interface CreateSyncServerOptions {
  /** The full server-side contract (ADR 012) — includes client-excluded models. */
  readonly contract: SyncServerContract;
  /** The client-projected contract (ADR 012) — defines which models are ever synced. */
  readonly clientContract: SyncServerContract;
  readonly rootModel: string;
}

export interface SyncServer {
  readonly rootModel: string;
  /** Resolve every event's ownership check. Pure — never touches a database. */
  validatePush(
    events: readonly SyncPushEvent[],
    options: { readonly scopeKey: string }
  ): readonly PushValidationResult[];
  /** Resolve every changelog row's pull-scope check. Pure — never touches a database. */
  buildPullQueries(
    logs: readonly SyncPullLogEntry[],
    options: { readonly scopeKey: string }
  ): readonly PullScopeResult[];
}

/**
 * Builds the ownership DAG once (throws on a broken schema — see
 * `buildOwnershipDag`) and returns a `SyncServer` bound to it.
 */
export function createSyncServer(options: CreateSyncServerOptions): SyncServer {
  const dag = buildOwnershipDag(options.contract, options.clientContract, options.rootModel);

  return {
    rootModel: dag.rootModel,
    validatePush: (events, pushOptions) => validatePush(dag, options.contract, events, pushOptions),
    buildPullQueries: (logs, pullOptions) => buildPullQueries(dag, options.contract, logs, pullOptions),
  };
}
