/**
 * IDB nested-write executor.
 *
 * IDB adaptation of `sql-orm-client/mutation-executor.ts`. Key differences
 * from the SQL vendor:
 *
 * - No column/field mapping — IDB field names ARE the storage keys.
 * - No `applyMutationDefaults` — IDB has no server-side defaults.
 * - `insertSingleRow` → `scope.execute({ kind: "put", ... })`.
 * - `findRowByCriterion` / `findFirstByFilters` → `scope.execute({ kind: "cursor-scan", ... })`.
 *   IDB allows reads inside a readwrite transaction; the transaction scope accepts
 *   all `IdbAtomicPlan` types including `cursor-scan`.
 * - Child-owned `connect` → `scope.execute({ kind: "scan-write", write: "put-merged", ... })`.
 *   IDB has no UPDATE SET WHERE, so we use the scan-write plan with a filter closure.
 * - `connect()` for parent-owned (N:1) relations throws if the referenced row is not
 *   found — this is Phase 6.4's implicit FK validation for the connect case.
 * - Recursive nesting (nested writes inside nested writes) is not supported and throws.
 *
 * All multi-store writes are wrapped in a single `withMutationScope` call that opens
 * one IDB transaction spanning all required stores, per ADR 007.
 */

import type { PlanMeta } from "@prisma-next/contract/types";
import type { ContractReferenceRelation } from "@prisma-next/contract/types";
import { contractModels } from "@prisma-next/contract/types";
import type { IdbAtomicPlan, IdbCursorScanPlan } from "@prisma-next-idb/driver-idb/runtime";
import { evaluateFilter, shorthandToFilterExpr } from "@prisma-next-idb/adapter-idb/runtime";
import type { IdbFilterExpr } from "@prisma-next-idb/adapter-idb/runtime";
import type { IdbReferentialAction } from "@prisma-next-idb/target-idb/pack";
import type { IdbQueryExecutor } from "./executor";
import { withMutationScope, type IdbQueryExecutorWithTransaction } from "./mutation-scope";
import { createRelationMutator, isRelationMutationCallback, isRelationMutationDescriptor } from "./relation-mutator";
import {
  type IdbContract,
  type IdbRelationMutation,
  type IdbRelationMutator,
  type MutationCreateInput,
  type MutationUpdateInput,
  getStoreName,
} from "./types";
import type { IdbTransactionScope } from "@prisma-next-idb/driver-idb/runtime";

// ── Internal types ─────────────────────────────────────────────────────────────

interface RelationDefinition {
  readonly relationName: string;
  readonly relatedModelName: string;
  readonly relatedStoreName: string;
  readonly cardinality: string | undefined;
  readonly localFields: readonly string[];
  readonly targetFields: readonly string[];
}

interface ParsedRelationMutation {
  readonly relation: RelationDefinition;
  readonly mutation: IdbRelationMutation<IdbContract, string>;
}

interface ParsedMutationInput {
  readonly scalarData: Record<string, unknown>;
  readonly relationMutations: readonly ParsedRelationMutation[];
}

// ── Plan meta helpers ─────────────────────────────────────────────────────────

function makePlanMeta(contract: IdbContract): PlanMeta {
  return {
    target: "idb",
    storageHash: contract.storage.storageHash,
    lane: "idb-mutation-executor",
    annotations: { groupingKey: "nested" },
  };
}

// ── Relation definition resolution (cached) ──────────────────────────────────

const relationDefsCache = new WeakMap<object, Map<string, RelationDefinition[]>>();

function getRelationDefinitions(contract: IdbContract, modelName: string): RelationDefinition[] {
  let perContract = relationDefsCache.get(contract);
  if (!perContract) {
    perContract = new Map();
    relationDefsCache.set(contract, perContract);
  }

  const cached = perContract.get(modelName);
  if (cached) return cached;

  const model = contractModels(contract)[modelName];
  if (!model) {
    perContract.set(modelName, []);
    return [];
  }

  const defs: RelationDefinition[] = [];
  for (const [relationName, rawRelation] of Object.entries(model.relations)) {
    if (!rawRelation || typeof rawRelation !== "object" || !("on" in rawRelation)) continue;

    const relation = rawRelation as ContractReferenceRelation;
    // v0.12.0: `relation.to` is a CrossReference `{ namespace, model }`.
    const relatedModelName = relation.to.model;
    const relatedStoreName = getStoreName(contract, relatedModelName);
    defs.push({
      relationName,
      relatedModelName,
      relatedStoreName,
      cardinality: relation.cardinality,
      localFields: relation.on.localFields,
      targetFields: relation.on.targetFields,
    });
  }

  perContract.set(modelName, defs);
  return defs;
}

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Returns true if `data` contains at least one field that is both a known
 * relation name for `modelName` and a function (a mutation callback).
 */
export function hasNestedMutationCallbacks(
  contract: IdbContract,
  modelName: string,
  data: Record<string, unknown>
): boolean {
  const relationNames = new Set(getRelationDefinitions(contract, modelName).map((r) => r.relationName));
  for (const [fieldName, value] of Object.entries(data)) {
    if (relationNames.has(fieldName) && isRelationMutationCallback(value)) return true;
  }
  return false;
}

/**
 * Guards that the executor supports multi-store transactions.
 * Throws a clear error if `transaction()` is not available — the user must
 * use IdbRuntime (createIdbRuntime / createAutoMigratingIdbClient) rather than
 * a plain IdbQueryExecutor stub.
 */
export function requireTransactionExecutor(executor: IdbQueryExecutor): IdbQueryExecutorWithTransaction {
  if (typeof (executor as IdbQueryExecutorWithTransaction).transaction !== "function") {
    throw new Error(
      "Nested relation writes require an executor with transaction support. " +
        "Use IdbRuntime (createIdbRuntime or createAutoMigratingIdbClient) instead of a plain IdbQueryExecutor."
    );
  }
  return executor as IdbQueryExecutorWithTransaction;
}

// ── Entry points ──────────────────────────────────────────────────────────────

export async function executeNestedCreateMutation(options: {
  executor: IdbQueryExecutorWithTransaction;
  contract: IdbContract;
  modelName: string;
  data: MutationCreateInput<IdbContract, string>;
}): Promise<Record<string, unknown>> {
  const { executor, contract, modelName, data } = options;
  const record = data as Record<string, unknown>;
  const storeNames = collectStoreNames(contract, modelName, record);
  return withMutationScope(executor, storeNames, (scope) => createGraph(scope, contract, modelName, record));
}

export async function executeNestedUpdateMutation(options: {
  executor: IdbQueryExecutorWithTransaction;
  contract: IdbContract;
  modelName: string;
  filters: readonly IdbFilterExpr[];
  data: MutationUpdateInput<IdbContract, string>;
}): Promise<Record<string, unknown> | null> {
  const { executor, contract, modelName, filters, data } = options;
  const record = data as Record<string, unknown>;
  const storeNames = collectStoreNames(contract, modelName, record);
  return withMutationScope(executor, storeNames, (scope) =>
    updateFirstGraph(scope, contract, modelName, filters, record)
  );
}

// ── Store name collection ─────────────────────────────────────────────────────

function collectStoreNames(contract: IdbContract, modelName: string, data: Record<string, unknown>): string[] {
  const stores = new Set([getStoreName(contract, modelName)]);
  for (const def of getRelationDefinitions(contract, modelName)) {
    if (def.relationName in data && isRelationMutationCallback(data[def.relationName])) {
      stores.add(def.relatedStoreName);
    }
  }
  return [...stores];
}

// ── Graph operations ──────────────────────────────────────────────────────────

async function createGraph(
  scope: IdbTransactionScope,
  contract: IdbContract,
  modelName: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const parsed = parseMutationInput(contract, modelName, input);
  const { parentOwned, childOwned } = partitionByOwnership(parsed.relationMutations);

  const scalarData = { ...parsed.scalarData };

  for (const item of parentOwned) {
    if (item.mutation.kind === "disconnect") {
      throw new Error("disconnect() is only supported in update() nested mutations");
    }
    await applyParentOwnedMutation(scope, contract, modelName, scalarData, item.relation, item.mutation);
  }

  const parentRow = await insertSingleRow(scope, contract, modelName, scalarData);

  for (const item of childOwned) {
    if (item.mutation.kind === "disconnect") {
      throw new Error("disconnect() is only supported in update() nested mutations");
    }
    await applyChildOwnedMutation(scope, contract, modelName, parentRow, item.relation, item.mutation);
  }

  return parentRow;
}

async function updateFirstGraph(
  scope: IdbTransactionScope,
  contract: IdbContract,
  modelName: string,
  filters: readonly IdbFilterExpr[],
  input: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const existingRow = await findFirstByFilters(scope, contract, modelName, filters);
  if (!existingRow) return null;

  const parsed = parseMutationInput(contract, modelName, input);
  const { parentOwned, childOwned } = partitionByOwnership(parsed.relationMutations);

  const scalarData = { ...parsed.scalarData };

  for (const item of parentOwned) {
    await applyParentOwnedMutation(scope, contract, modelName, scalarData, item.relation, item.mutation);
  }

  let parentRow = existingRow;

  if (Object.keys(scalarData).length > 0) {
    const storeName = getStoreName(contract, modelName);
    const keyPath = getKeyPath(contract, modelName);
    const key = existingRow[keyPath] as IDBValidKey;
    const meta = makePlanMeta(contract);
    const rows = await scope.execute({ meta, kind: "update", storeName, key, patch: scalarData });
    const updated = rows[0];
    if (updated) parentRow = updated;
  }

  for (const item of childOwned) {
    await applyChildOwnedMutation(scope, contract, modelName, parentRow, item.relation, item.mutation);
  }

  return parentRow;
}

// ── Input parsing ─────────────────────────────────────────────────────────────

function parseMutationInput(
  contract: IdbContract,
  modelName: string,
  input: Record<string, unknown>
): ParsedMutationInput {
  const scalarData: Record<string, unknown> = {};
  const relationDefs = new Map(getRelationDefinitions(contract, modelName).map((r) => [r.relationName, r]));
  const relationMutations: ParsedRelationMutation[] = [];

  for (const [fieldName, value] of Object.entries(input)) {
    const relation = relationDefs.get(fieldName);
    if (!relation) {
      scalarData[fieldName] = value;
      continue;
    }

    if (!isRelationMutationCallback(value)) {
      throw new Error(`Relation field "${fieldName}" on model "${modelName}" expects a mutator callback`);
    }

    const mutator = createRelationMutator<IdbContract, string>();
    const mutation = value(mutator as IdbRelationMutator<IdbContract, string>);
    if (!isRelationMutationDescriptor(mutation)) {
      throw new Error(`Relation field "${fieldName}" on model "${modelName}" returned an invalid mutation descriptor`);
    }

    relationMutations.push({ relation, mutation });
  }

  return { scalarData, relationMutations };
}

// ── Ownership partitioning ────────────────────────────────────────────────────

function partitionByOwnership(mutations: readonly ParsedRelationMutation[]): {
  parentOwned: ParsedRelationMutation[];
  childOwned: ParsedRelationMutation[];
} {
  const parentOwned: ParsedRelationMutation[] = [];
  const childOwned: ParsedRelationMutation[] = [];

  for (const item of mutations) {
    if (item.relation.cardinality === "N:1") {
      parentOwned.push(item);
      continue;
    }
    if (item.relation.cardinality === "M:N") {
      throw new Error("M:N nested mutations are not supported");
    }
    childOwned.push(item);
  }

  return { parentOwned, childOwned };
}

// ── Parent-owned (N:1) mutations ──────────────────────────────────────────────

async function applyParentOwnedMutation(
  scope: IdbTransactionScope,
  contract: IdbContract,
  parentModelName: string,
  scalarData: Record<string, unknown>,
  relation: RelationDefinition,
  mutation: IdbRelationMutation<IdbContract, string>
): Promise<void> {
  if (mutation.kind === "disconnect") {
    for (const localField of relation.localFields) {
      scalarData[localField] = null;
    }
    return;
  }

  if (mutation.kind === "create") {
    const row = mutation.data[0] as Record<string, unknown> | undefined;
    if (!row) {
      throw new Error(`create() nested mutation for relation "${relation.relationName}" requires data`);
    }
    // Recursive nesting is not supported in Phase 6.4 — the nested record must
    // be a plain scalar create, not itself a nested mutation.
    const relatedRow = await insertSingleRow(scope, contract, relation.relatedModelName, row);
    copyRelatedValuesToParent(relation, scalarData, relatedRow, parentModelName, contract);
    return;
  }

  // connect()
  const criterion = mutation.criteria[0] as Record<string, unknown> | undefined;
  if (!criterion) {
    throw new Error(`connect() nested mutation for relation "${relation.relationName}" requires a criterion`);
  }
  const relatedRow = await findRowByCriterion(scope, contract, relation.relatedModelName, criterion);
  if (!relatedRow) {
    throw new Error(`connect() nested mutation for relation "${relation.relationName}" did not find a matching row`);
  }
  copyRelatedValuesToParent(relation, scalarData, relatedRow, parentModelName, contract);
}

function copyRelatedValuesToParent(
  relation: RelationDefinition,
  scalarData: Record<string, unknown>,
  relatedRow: Record<string, unknown>,
  _parentModelName: string,
  _contract: IdbContract
): void {
  // localFields = parent's FK fields; targetFields = related model's PK/unique fields
  for (let i = 0; i < relation.localFields.length; i++) {
    const localField = relation.localFields[i];
    const targetField = relation.targetFields[i];
    if (!localField || !targetField) continue;
    scalarData[localField] = relatedRow[targetField];
  }
}

// ── Child-owned (1:N / 1:1) mutations ────────────────────────────────────────

async function applyChildOwnedMutation(
  scope: IdbTransactionScope,
  contract: IdbContract,
  parentModelName: string,
  parentRow: Record<string, unknown>,
  relation: RelationDefinition,
  mutation: IdbRelationMutation<IdbContract, string>
): Promise<void> {
  // parentValues: childFkField → parentPkValue (e.g. "authorId" → "u1")
  const parentValues = readParentColumnValues(parentModelName, relation, parentRow);

  if (mutation.kind === "create") {
    for (const childInput of mutation.data) {
      const payload: Record<string, unknown> = { ...(childInput as Record<string, unknown>) };
      for (const [childField, parentValue] of parentValues.entries()) {
        payload[childField] = parentValue;
      }
      await insertSingleRow(scope, contract, relation.relatedModelName, payload);
    }
    return;
  }

  if (mutation.kind === "connect") {
    for (const criterion of mutation.criteria) {
      const setValues: Record<string, unknown> = {};
      for (const [childField, parentValue] of parentValues.entries()) {
        setValues[childField] = parentValue;
      }
      const filter = buildCriterionFilter(criterion as Record<string, unknown>);
      const meta = makePlanMeta(contract);
      // scan-write + put-merged: set the FK fields on every child row matching
      // the criterion. No `take` cap — the vendor's relational connect
      // (`executeUpdateCount`) connects all matching rows; for the normal
      // unique-key criterion that is exactly one row anyway. (PLAN Issue #24.)
      await scope.execute({
        meta,
        kind: "scan-write",
        storeName: relation.relatedStoreName,
        write: "put-merged",
        patch: setValues,
        filter,
      });
    }
    return;
  }

  // disconnect()
  const setValues: Record<string, unknown> = {};
  for (const childField of parentValues.keys()) {
    setValues[childField] = null;
  }
  const meta = makePlanMeta(contract);

  if (!mutation.criteria || mutation.criteria.length === 0) {
    // Disconnect all children of this parent.
    const parentJoinFilter = buildParentJoinFilter(parentValues);
    await scope.execute({
      meta,
      kind: "scan-write",
      storeName: relation.relatedStoreName,
      write: "put-merged",
      patch: setValues,
      filter: parentJoinFilter,
    });
    return;
  }

  // Disconnect specific children matching each criterion AND the parent join.
  for (const criterion of mutation.criteria) {
    const criterionFilter = buildCriterionFilter(criterion as Record<string, unknown>);
    const parentJoinFilter = buildParentJoinFilter(parentValues);
    const combinedFilter = (row: Record<string, unknown>): boolean => parentJoinFilter(row) && criterionFilter(row);
    await scope.execute({
      meta,
      kind: "scan-write",
      storeName: relation.relatedStoreName,
      write: "put-merged",
      patch: setValues,
      filter: combinedFilter,
    });
  }
}

function readParentColumnValues(
  parentModelName: string,
  relation: RelationDefinition,
  parentRow: Record<string, unknown>
): Map<string, unknown> {
  const values = new Map<string, unknown>();
  // For 1:N: localFields = parent PK fields; targetFields = child FK fields
  for (let i = 0; i < relation.localFields.length; i++) {
    const localField = relation.localFields[i];
    const targetField = relation.targetFields[i];
    if (!localField || !targetField) continue;
    const parentValue = parentRow[localField];
    if (parentValue === undefined) {
      throw new Error(
        `Nested mutation requires parent field "${localField}" to be present in "${parentModelName}" row`
      );
    }
    // targetField is the child's FK column name; map it to the parent's value.
    values.set(targetField, parentValue);
  }
  return values;
}

// ── Row operations ────────────────────────────────────────────────────────────

async function insertSingleRow(
  scope: IdbTransactionScope,
  contract: IdbContract,
  modelName: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  assertNoNestedCallbacks(modelName, data);
  const storeName = getStoreName(contract, modelName);
  const meta = makePlanMeta(contract);
  const rows = await scope.execute({ meta, kind: "put", storeName, record: data });
  return rows[0] ?? data;
}

/**
 * Recursive nesting (a relation callback inside an already-nested create) is
 * not supported in Phase 6.4. Without this guard the callback function would be
 * handed to `store.put(...)`, where IDB's structured-clone throws an opaque
 * `DataCloneError` ("could not be cloned") that gives the developer no hint
 * about the real cause. Surface a precise error instead. (PLAN Issue #22.)
 */
function assertNoNestedCallbacks(modelName: string, data: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(data)) {
    if (typeof value === "function") {
      throw new Error(
        `Recursive nested writes are not supported: field "${field}" on a nested "${modelName}" ` +
          "record is a relation callback. Only one level of relation nesting is supported — " +
          "flatten the inner relation into a separate create/connect call."
      );
    }
  }
}

async function findRowByCriterion(
  scope: IdbTransactionScope,
  contract: IdbContract,
  modelName: string,
  criterion: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const expr = shorthandToFilterExpr(criterion);
  if (!expr) {
    throw new Error(`Nested connect for model "${modelName}" requires a non-empty criterion`);
  }
  const filter = (row: Record<string, unknown>): boolean => evaluateFilter(expr, row);
  return scanOneRow(scope, contract, modelName, filter);
}

async function findFirstByFilters(
  scope: IdbTransactionScope,
  contract: IdbContract,
  modelName: string,
  filters: readonly IdbFilterExpr[]
): Promise<Record<string, unknown> | null> {
  if (filters.length === 0) return null;
  const combined = filters.length === 1 ? filters[0]! : { kind: "and" as const, exprs: filters };
  const filter = (row: Record<string, unknown>): boolean => evaluateFilter(combined, row);
  return scanOneRow(scope, contract, modelName, filter);
}

async function scanOneRow(
  scope: IdbTransactionScope,
  contract: IdbContract,
  modelName: string,
  filter: (row: Record<string, unknown>) => boolean
): Promise<Record<string, unknown> | null> {
  const storeName = getStoreName(contract, modelName);
  const meta = makePlanMeta(contract);
  const plan: IdbCursorScanPlan = { meta, kind: "cursor-scan", storeName, filter, take: 1 };
  const rows = await scope.execute(plan as IdbAtomicPlan);
  return rows[0] ?? null;
}

// ── Filter helpers ────────────────────────────────────────────────────────────

function buildCriterionFilter(criterion: Record<string, unknown>): (row: Record<string, unknown>) => boolean {
  const expr = shorthandToFilterExpr(criterion);
  if (!expr) return () => true;
  return (row) => evaluateFilter(expr, row);
}

function buildParentJoinFilter(parentValues: Map<string, unknown>): (row: Record<string, unknown>) => boolean {
  const pairs = [...parentValues.entries()];
  return (row: Record<string, unknown>): boolean =>
    pairs.every(([childField, parentValue]) => row[childField] === parentValue);
}

// ── Key path helper ───────────────────────────────────────────────────────────

function getKeyPath(contract: IdbContract, modelName: string): string {
  const model = contractModels(contract)[modelName];
  return (model?.storage as { keyPath?: string } | undefined)?.keyPath ?? "id";
}

// ── Referential action helpers ────────────────────────────────────────────────

function getOnDelete(contract: IdbContract, modelName: string, relationName: string): IdbReferentialAction {
  const model = contractModels(contract)[modelName];
  const storage = model?.storage as { relations?: Record<string, { onDelete?: string }> } | undefined;
  return (storage?.relations?.[relationName]?.onDelete ?? "restrict") as IdbReferentialAction;
}

function isDeleteEnforcementRelation(contract: IdbContract, modelName: string, def: RelationDefinition): boolean {
  if (def.cardinality === "1:N") return true;
  if (def.cardinality === "1:1") {
    const keyPath = getKeyPath(contract, modelName);
    return def.localFields.length > 0 && def.localFields[0] === keyPath;
  }
  return false;
}

// ── Scalar FK validation ──────────────────────────────────────────────────────

/**
 * Returns true if `data` contains at least one non-null value for a localField
 * of a N:1 relation — indicating scalar FK fields that need existence validation.
 */
export function hasScalarFkFields(contract: IdbContract, modelName: string, data: Record<string, unknown>): boolean {
  for (const def of getRelationDefinitions(contract, modelName)) {
    if (def.cardinality !== "N:1") continue;
    for (const localField of def.localFields) {
      if (localField in data && data[localField] !== null && data[localField] !== undefined) return true;
    }
  }
  return false;
}

function collectScalarFkStoreNames(contract: IdbContract, modelName: string, data: Record<string, unknown>): string[] {
  const stores = new Set([getStoreName(contract, modelName)]);
  for (const def of getRelationDefinitions(contract, modelName)) {
    if (def.cardinality !== "N:1") continue;
    const hasFkField = def.localFields.some((f) => f in data && data[f] !== null && data[f] !== undefined);
    if (hasFkField) stores.add(def.relatedStoreName);
  }
  return [...stores];
}

async function validateScalarFks(
  scope: IdbTransactionScope,
  contract: IdbContract,
  modelName: string,
  data: Record<string, unknown>
): Promise<void> {
  const meta = makePlanMeta(contract);
  for (const def of getRelationDefinitions(contract, modelName)) {
    if (def.cardinality !== "N:1") continue;
    for (let i = 0; i < def.localFields.length; i++) {
      const localField = def.localFields[i]!;
      const targetField = def.targetFields[i]!;
      const value = data[localField];
      if (!(localField in data) || value === null || value === undefined) continue;
      const filter = (row: Record<string, unknown>): boolean => row[targetField] === value;
      const plan: IdbCursorScanPlan = {
        meta,
        kind: "cursor-scan",
        storeName: def.relatedStoreName,
        filter,
        take: 1,
      };
      const rows = await scope.execute(plan as IdbAtomicPlan);
      if (rows.length === 0) {
        throw new Error(
          `FK violation on relation '${def.relationName}': no ${def.relatedModelName} with ${targetField}='${String(value)}'`
        );
      }
    }
  }
}

export async function executeScalarCreateWithFkValidation(options: {
  executor: IdbQueryExecutorWithTransaction;
  contract: IdbContract;
  modelName: string;
  data: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
  const { executor, contract, modelName, data } = options;
  const storeNames = collectScalarFkStoreNames(contract, modelName, data);
  return withMutationScope(executor, storeNames, async (scope) => {
    await validateScalarFks(scope, contract, modelName, data);
    return insertSingleRow(scope, contract, modelName, data);
  });
}

export async function executeScalarUpdateWithFkValidation(options: {
  executor: IdbQueryExecutorWithTransaction;
  contract: IdbContract;
  modelName: string;
  filters: readonly IdbFilterExpr[];
  data: Record<string, unknown>;
}): Promise<Record<string, unknown> | null> {
  const { executor, contract, modelName, filters, data } = options;
  const storeNames = collectScalarFkStoreNames(contract, modelName, data);
  return withMutationScope(executor, storeNames, async (scope) => {
    await validateScalarFks(scope, contract, modelName, data);
    const storeName = getStoreName(contract, modelName);
    const meta = makePlanMeta(contract);
    const combined =
      filters.length === 0 ? undefined : filters.length === 1 ? filters[0]! : { kind: "and" as const, exprs: filters };
    const filter =
      combined !== undefined ? (row: Record<string, unknown>): boolean => evaluateFilter(combined, row) : undefined;
    const rows = await scope.execute({
      meta,
      kind: "scan-write",
      storeName,
      write: "put-merged",
      patch: data,
      take: 1,
      ...(filter !== undefined ? { filter } : {}),
    } as IdbAtomicPlan);
    return rows[0] ?? null;
  });
}

// ── Delete referential action enforcement ─────────────────────────────────────

/**
 * Returns true if the model has at least one child relation (1:N or parent-side
 * 1:1) whose `onDelete` action requires enforcement (anything except `noAction`).
 * Since the default is `restrict`, any model with 1:N/1:1 relations that do not
 * explicitly set `noAction` returns true.
 */
export function hasEnforceableChildRelations(contract: IdbContract, modelName: string): boolean {
  for (const def of getRelationDefinitions(contract, modelName)) {
    if (!isDeleteEnforcementRelation(contract, modelName, def)) continue;
    if (getOnDelete(contract, modelName, def.relationName) !== "noAction") return true;
  }
  return false;
}

function collectDeleteStoreNames(contract: IdbContract, modelName: string): string[] {
  const stores = new Set([getStoreName(contract, modelName)]);
  for (const def of getRelationDefinitions(contract, modelName)) {
    if (!isDeleteEnforcementRelation(contract, modelName, def)) continue;
    if (getOnDelete(contract, modelName, def.relationName) !== "noAction") {
      stores.add(def.relatedStoreName);
    }
  }
  return [...stores];
}

async function applyReferentialActionsForRow(
  scope: IdbTransactionScope,
  contract: IdbContract,
  modelName: string,
  row: Record<string, unknown>
): Promise<void> {
  const meta = makePlanMeta(contract);
  for (const def of getRelationDefinitions(contract, modelName)) {
    if (!isDeleteEnforcementRelation(contract, modelName, def)) continue;
    const action = getOnDelete(contract, modelName, def.relationName);
    if (action === "noAction") continue;

    // Build the filter matching children of this parent row.
    const pairs = def.localFields.map((lf, i) => ({ childField: def.targetFields[i]!, parentValue: row[lf] }));
    const childFilter = (child: Record<string, unknown>): boolean =>
      pairs.every(({ childField, parentValue }) => child[childField] === parentValue);

    if (action === "restrict") {
      const found = await scope.execute({
        meta,
        kind: "cursor-scan",
        storeName: def.relatedStoreName,
        filter: childFilter,
        take: 1,
      } as IdbAtomicPlan);
      if (found.length > 0) {
        const keyPath = getKeyPath(contract, modelName);
        throw new Error(
          `Cannot delete ${modelName} '${String(row[keyPath])}': child records exist on relation '${def.relationName}'. ` +
            "Use onDelete: 'cascade', 'setNull', or 'noAction'."
        );
      }
      continue;
    }

    if (action === "cascade") {
      await scope.execute({
        meta,
        kind: "scan-write",
        storeName: def.relatedStoreName,
        write: "delete",
        filter: childFilter,
      } as IdbAtomicPlan);
      continue;
    }

    if (action === "setNull") {
      const patch: Record<string, unknown> = {};
      for (const targetField of def.targetFields) patch[targetField] = null;
      await scope.execute({
        meta,
        kind: "scan-write",
        storeName: def.relatedStoreName,
        write: "put-merged",
        patch,
        filter: childFilter,
      } as IdbAtomicPlan);
      continue;
    }

    if (action === "setDefault") {
      throw new Error(
        `setDefault referential action is not supported on relation '${def.relationName}': ` +
          "IDB contracts do not track field defaults. Use 'cascade', 'setNull', or 'noAction' instead."
      );
    }
  }
}

export async function executeDeleteWithReferentialActions(options: {
  executor: IdbQueryExecutorWithTransaction;
  contract: IdbContract;
  modelName: string;
  key: IDBValidKey;
}): Promise<void> {
  const { executor, contract, modelName, key } = options;
  const storeNames = collectDeleteStoreNames(contract, modelName);
  await withMutationScope(executor, storeNames, async (scope) => {
    const storeName = getStoreName(contract, modelName);
    const meta = makePlanMeta(contract);
    const rows = await scope.execute({ meta, kind: "key-get", storeName, key } as IdbAtomicPlan);
    const row = rows[0];
    if (!row) return [];
    await applyReferentialActionsForRow(scope, contract, modelName, row);
    await scope.execute({ meta, kind: "delete", storeName, key } as IdbAtomicPlan);
    return [];
  });
}

export async function executeDeleteAllWithReferentialActions(options: {
  executor: IdbQueryExecutorWithTransaction;
  contract: IdbContract;
  modelName: string;
  filter?: (row: Record<string, unknown>) => boolean;
}): Promise<Record<string, unknown>[]> {
  const { executor, contract, modelName, filter } = options;
  const storeNames = collectDeleteStoreNames(contract, modelName);
  return withMutationScope(executor, storeNames, async (scope) => {
    const storeName = getStoreName(contract, modelName);
    const meta = makePlanMeta(contract);
    const keyPath = getKeyPath(contract, modelName);
    const rows = await scope.execute({
      meta,
      kind: "cursor-scan",
      storeName,
      ...(filter !== undefined ? { filter } : {}),
    } as IdbAtomicPlan);
    for (const row of rows) {
      await applyReferentialActionsForRow(scope, contract, modelName, row);
      const key = row[keyPath] as IDBValidKey;
      await scope.execute({ meta, kind: "delete", storeName, key } as IdbAtomicPlan);
    }
    return rows;
  });
}
