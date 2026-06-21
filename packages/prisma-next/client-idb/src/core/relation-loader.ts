import type { ContractReferenceRelation } from "@prisma-next/contract/types";
import { domainModelsAtDefaultNamespace } from "@prisma-next/contract/types";
import type { IdbQueryPlan } from "@prisma-next-idb/adapter-idb/runtime";
import { evaluateFilter } from "@prisma-next-idb/adapter-idb/runtime";
import type { IdbRowFilter } from "@prisma-next-idb/driver-idb/runtime";
import type { IdbQueryExecutor } from "./executor";
import { buildRowComparator, combineFilterExprs } from "./query-shaping";
import type { IncludeEntry } from "./store-state";
import type { IdbContract } from "./types";

/**
 * Batch-load a single named relation for all rows in `rows` and attach the
 * result to each row under the `relName` key.
 *
 * The join is done with one cursor scan over the related store (with an
 * in-memory filter), then grouped/indexed in memory — avoiding N+1 queries.
 *
 * The `entry` carries any `include()` refinement:
 *
 * - `collection` — the refined `where` further filters the child scan;
 *   `orderBy` / `skip` / `take` are applied **per parent group** for `1:N`
 *   relations (each parent's children are independently sorted and paginated).
 * - `scalar` — the relation field becomes the `count` of matching children
 *   (to-many only; `include()` rejects scalar refinements on to-one relations).
 *
 * @param relName    - The relation key to load (e.g. `"posts"`, `"author"`).
 * @param entry      - How to materialise the relation (collection vs scalar + refinement state).
 * @param rows       - The parent rows to attach related data to.
 * @param contract   - The resolved IDB contract.
 * @param modelName  - The source model name (owner of the relation).
 * @param executor   - The query executor used to run the related-store scan.
 */
export async function loadRelation(
  relName: string,
  entry: IncludeEntry,
  rows: Record<string, unknown>[],
  contract: IdbContract,
  modelName: string,
  executor: IdbQueryExecutor,
  groupingKey: string
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return rows;

  const models = domainModelsAtDefaultNamespace(contract.domain);
  const model = models[modelName];
  if (model === undefined) return rows;

  const rawRelation = model.relations[relName];
  if (rawRelation === undefined) return rows;

  // Only handle reference relations (cross-store joins). Embed relations don't
  // have an `on` block and are stored inline — nothing to load.
  if (!("on" in rawRelation)) return rows;

  const relation = rawRelation as ContractReferenceRelation;
  const { cardinality, on } = relation;
  // `relation.to` is a CrossReference `{ namespace, model }`.
  const relatedModelName = relation.to.model;

  const localField = on.localFields[0];
  const foreignField = on.targetFields[0];
  if (localField === undefined || foreignField === undefined) return rows;

  const relatedModel = models[relatedModelName];
  if (relatedModel === undefined) return rows;

  // Resolve the related object store name from the model's storage metadata.
  const relatedStoreName =
    typeof relatedModel.storage === "object" && relatedModel.storage !== null && "storeName" in relatedModel.storage
      ? String((relatedModel.storage as { storeName: unknown })["storeName"])
      : relatedModelName;

  const isScalar = entry.kind === "scalar";

  // Collect all distinct local-field values to drive the in-memory filter.
  const localValues = new Set<unknown>();
  for (const row of rows) {
    const v = row[localField];
    if (v !== undefined && v !== null) localValues.add(v);
  }

  // Short-circuit: if all local values are null/undefined, attach empties.
  // (Scalar counts are 0; to-many is [], to-one is null.)
  if (localValues.size === 0) {
    return rows.map((row) => ({
      ...row,
      [relName]: isScalar ? 0 : cardinality === "1:N" ? [] : null,
    }));
  }

  // One scan: load related rows whose foreignField is in localValues AND that
  // satisfy any refined `where` carried on the include entry.
  const capturedForeignField = foreignField;
  const refinedWhere = combineFilterExprs(entry.state.filters);
  const filter: IdbRowFilter = (row: Record<string, unknown>): boolean =>
    localValues.has(row[capturedForeignField]) && (refinedWhere === undefined || evaluateFilter(refinedWhere, row));

  const storageHash = contract.storage.storageHash;
  const planMeta = { target: "idb", storageHash, lane: "idb-orm", annotations: { groupingKey } } as const;
  const plan: IdbQueryPlan<Record<string, unknown>> = {
    meta: planMeta,
    idbPlan: { meta: planMeta, kind: "cursor-scan", storeName: relatedStoreName, filter },
  };

  const relatedRows: Record<string, unknown>[] = [];
  for await (const row of executor.execute(plan)) {
    relatedRows.push(row);
  }

  // ── Merge ──────────────────────────────────────────────────────────────────

  if (cardinality === "1:N") {
    // Group related rows by their foreignField value.
    const grouped = new Map<unknown, Record<string, unknown>[]>();
    for (const rrow of relatedRows) {
      const gk = rrow[capturedForeignField];
      const group = grouped.get(gk) ?? [];
      group.push(rrow);
      grouped.set(gk, group);
    }

    if (isScalar) {
      // Scalar reducer (Phase 6.5: count) — attach the per-parent child count.
      return rows.map((row) => ({
        ...row,
        [relName]: (grouped.get(row[localField]) ?? []).length,
      }));
    }

    // Collection: apply refined orderBy / skip / take per parent group.
    const comparator = buildRowComparator(entry.state.orderBy);
    const skip = entry.state.skip ?? 0;
    const take = entry.state.take;
    return rows.map((row) => {
      let group = grouped.get(row[localField]) ?? [];
      if (comparator !== undefined) group = [...group].sort(comparator);
      if (skip > 0 || take !== undefined) {
        group = group.slice(skip, take !== undefined ? skip + take : undefined);
      }
      return { ...row, [relName]: group };
    });
  }

  // N:1 / 1:1: index related rows by their foreignField value, attach singles.
  // A refined `where` that excludes the related row yields `null` here.
  const indexed = new Map<unknown, Record<string, unknown>>();
  for (const rrow of relatedRows) {
    indexed.set(rrow[capturedForeignField], rrow);
  }
  return rows.map((row) => ({
    ...row,
    [relName]: indexed.get(row[localField]) ?? null,
  }));
}
