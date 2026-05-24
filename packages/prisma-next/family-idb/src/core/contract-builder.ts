import { computeProfileHash, computeStorageHash } from "@prisma-next/contract/hashing";
import type { Contract } from "@prisma-next/contract/types";
import type {
  IdbIndexDefinition,
  IdbModelStorage,
  IdbStorage,
  IdbStoreDefinition,
} from "@prisma-next-idb/target-idb/pack";
import { validateContract } from "./validate";

// ── Input types ───────────────────────────────────────────────────────────────

export type RelationDef = {
  readonly to: string;
  readonly cardinality: "1:1" | "1:N" | "N:1";
  readonly on: {
    readonly local: readonly string[];
    readonly target: readonly string[];
  };
};

export type IndexDef = {
  readonly keyPath: string;
  readonly unique?: boolean;
  readonly multiEntry?: boolean;
};

export type ModelDef = {
  readonly store: string;
  readonly key: string;
  readonly fields?: Record<string, string>;
  readonly indexes?: Record<string, IndexDef>;
  readonly relations?: Record<string, RelationDef>;
};

export type DefineContractInput = {
  /** Pass the default export of `@prisma-next-idb/family-idb/pack`. */
  readonly family: { readonly familyId: "idb"; readonly id: string };
  /** Pass the default export of `@prisma-next-idb/target-idb/pack`. */
  readonly target: { readonly targetId: string; readonly id: string };
  readonly models: Record<string, ModelDef>;
};

// ── Helper: derive the `roots` map (storeName → ModelName) ───────────────────

function buildRoots(models: Record<string, ModelDef>): Record<string, string> {
  const roots: Record<string, string> = {};
  for (const [modelName, def] of Object.entries(models)) {
    roots[def.store] = modelName;
  }
  return roots;
}

// ── Helper: derive storage.stores from model definitions ─────────────────────

function buildStores(models: Record<string, ModelDef>): Record<string, IdbStoreDefinition> {
  const stores: Record<string, IdbStoreDefinition> = {};
  for (const def of Object.values(models)) {
    const indexes: Record<string, IdbIndexDefinition> = {};
    for (const [indexName, idx] of Object.entries(def.indexes ?? {})) {
      indexes[indexName] = {
        keyPath: idx.keyPath,
        unique: idx.unique ?? false,
        ...(idx.multiEntry !== undefined ? { multiEntry: idx.multiEntry } : {}),
      };
    }
    stores[def.store] = {
      keyPath: def.key,
      ...(Object.keys(indexes).length > 0 ? { indexes } : {}),
    };
  }
  return stores;
}

// ── Helper: build the models section ─────────────────────────────────────────

type ContractModelEntry = {
  readonly fields: Record<string, never>;
  readonly relations: Record<
    string,
    {
      readonly to: string;
      readonly cardinality: "1:1" | "1:N" | "N:1";
      readonly on: { readonly localFields: readonly string[]; readonly targetFields: readonly string[] };
    }
  >;
  readonly storage: IdbModelStorage;
};

function buildModels(models: Record<string, ModelDef>): Record<string, ContractModelEntry> {
  const result: Record<string, ContractModelEntry> = {};
  for (const [modelName, def] of Object.entries(models)) {
    const relations: ContractModelEntry["relations"] = {};
    for (const [relName, rel] of Object.entries(def.relations ?? {})) {
      relations[relName] = {
        to: rel.to,
        cardinality: rel.cardinality,
        on: { localFields: rel.on.local, targetFields: rel.on.target },
      };
    }
    result[modelName] = {
      fields: {} as Record<string, never>,
      relations,
      storage: { storeName: def.store, keyPath: def.key },
    };
  }
  return result;
}

// ── defineContract ────────────────────────────────────────────────────────────

/**
 * Builds a typed IDB contract from a developer-friendly model definition.
 *
 * This is the TypeScript-first (no-emit) authoring path per ADR 006. The
 * returned contract object can be passed directly to `createIdbClient()` or
 * to `typescriptContract()` for config-file usage.
 *
 * @example
 * ```ts
 * import { defineContract } from '@prisma-next-idb/family-idb/contract-ts';
 * import idbFamily from '@prisma-next-idb/family-idb/pack';
 * import idbTarget from '@prisma-next-idb/target-idb/pack';
 *
 * export default defineContract({
 *   family: idbFamily,
 *   target: idbTarget,
 *   models: {
 *     User: {
 *       store: 'users',
 *       key: 'id',
 *       fields: { id: 'String', name: 'String', email: 'String' },
 *       indexes: { byEmail: { keyPath: 'email', unique: true } },
 *     },
 *   },
 * });
 * ```
 */
export function defineContract(input: DefineContractInput): Contract<IdbStorage> {
  const stores = buildStores(input.models);

  const storageHash = computeStorageHash({
    target: "idb",
    targetFamily: "idb",
    storage: { stores },
  });

  const profileHash = computeProfileHash({
    target: "idb",
    targetFamily: "idb",
    capabilities: {},
  });

  const storage: IdbStorage = { stores, storageHash };

  const contract: Contract<IdbStorage> = {
    target: "idb",
    targetFamily: "idb",
    roots: buildRoots(input.models),
    models: buildModels(input.models) as Contract<IdbStorage>["models"],
    storage,
    capabilities: {},
    extensionPacks: {},
    meta: {},
    profileHash,
  };

  // Validate at definition time — surfaces schema errors immediately rather
  // than at first query execution.
  validateContract(contract);

  return contract;
}
