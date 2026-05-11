import type { IdbStoreDefinition } from "./idb-contract-types";
import {
  createIndexOp,
  createObjectStoreOp,
  dropIndexOp,
  dropObjectStoreOp,
  type IdbDdlOp,
} from "./migration-factories";

/**
 * Minimal schema shape used for diffing.
 *
 * Structurally identical to `IdbSchemaIR` in `family-idb` — compatible by
 * TypeScript's structural typing. The contract's `storage.stores` map
 * (which uses `IdbStoreDefinition`) has the same shape as `IdbStoreIR`, so
 * both can be passed here without conversion.
 */
export type IdbSchemaDiffInput = {
  readonly stores: Record<string, IdbStoreDefinition>;
};

/**
 * Compute an ordered set of DDL operations to migrate from `from` to `to`.
 *
 * Safe execution order (important for a single `upgradeneeded` transaction):
 * 1. Create new stores — additive
 * 2. Create indexes on those new stores — additive
 * 3. Create new indexes on existing stores — additive
 * 4. Drop removed indexes from surviving stores — destructive
 * 5. Drop removed stores — destructive
 *
 * @param from - Current schema, or `null` for a fresh (empty) database.
 * @param to   - Desired target schema.
 */
export function diffIdbSchema(from: IdbSchemaDiffInput | null, to: IdbSchemaDiffInput): IdbDdlOp[] {
  const fromStores = from?.stores ?? {};
  const toStores = to.stores;
  const ops: IdbDdlOp[] = [];

  // 1 + 2. New stores and their indexes (additive)
  for (const [storeName, toDef] of Object.entries(toStores)) {
    if (storeName in fromStores) continue;
    ops.push(createObjectStoreOp(storeName, toDef));
    for (const [indexName, indexDef] of Object.entries(toDef.indexes ?? {})) {
      ops.push(createIndexOp(storeName, indexName, indexDef));
    }
  }

  // 3. New indexes on existing stores (additive)
  for (const [storeName, toDef] of Object.entries(toStores)) {
    const fromDef = fromStores[storeName];
    if (fromDef === undefined) continue; // new store — handled above
    const fromIndexes = fromDef.indexes ?? {};
    for (const [indexName, indexDef] of Object.entries(toDef.indexes ?? {})) {
      if (!(indexName in fromIndexes)) {
        ops.push(createIndexOp(storeName, indexName, indexDef));
      }
    }
  }

  // 4. Drop removed indexes from surviving stores (destructive)
  for (const [storeName, fromDef] of Object.entries(fromStores)) {
    if (!(storeName in toStores)) continue; // whole store gone — handled below
    const toStoreDef = toStores[storeName];
    const toIndexes = toStoreDef?.indexes ?? {};
    for (const indexName of Object.keys(fromDef.indexes ?? {})) {
      if (!(indexName in toIndexes)) {
        ops.push(dropIndexOp(storeName, indexName));
      }
    }
  }

  // 5. Drop removed stores (destructive)
  for (const storeName of Object.keys(fromStores)) {
    if (!(storeName in toStores)) {
      ops.push(dropObjectStoreOp(storeName));
    }
  }

  return ops;
}
