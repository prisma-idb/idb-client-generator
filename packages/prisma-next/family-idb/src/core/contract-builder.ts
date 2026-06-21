import { computeProfileHash, computeStorageHash } from "@prisma-next/contract/hashing";
import type { ApplicationDomain, Contract, ContractField, CrossReference } from "@prisma-next/contract/types";
import { UNBOUND_DOMAIN_NAMESPACE_ID, crossRef } from "@prisma-next/contract/types";
import type {
  IdbIndexDefinition,
  IdbModelStorage,
  IdbReferentialAction,
  IdbStorage,
  IdbStoreDefinition,
} from "@prisma-next-idb/target-idb/pack";
import { validateContract } from "./validate";

// ── Field type system ─────────────────────────────────────────────────────────

type PrismaScalarType = "String" | "Int" | "Float" | "Boolean" | "DateTime" | "BigInt" | "Decimal" | "Json" | "Bytes";

/**
 * A field spec string: the Prisma scalar type name, optionally suffixed with
 * `?` to indicate the field is nullable (e.g. `"String"`, `"Int?"`, `"DateTime?"`).
 */
export type FieldSpec = PrismaScalarType | `${PrismaScalarType}?`;

const SCALAR_TO_CODEC_ID: Record<PrismaScalarType, string> = {
  String: "idb/string@1",
  Int: "idb/int32@1",
  Float: "idb/double@1",
  Boolean: "idb/bool@1",
  DateTime: "idb/date@1",
  BigInt: "idb/bigint@1",
  Decimal: "idb/decimal@1",
  Json: "idb/json@1",
  Bytes: "idb/bytes@1",
};

// ── Input types ───────────────────────────────────────────────────────────────

export type RelationDef = {
  readonly to: string;
  readonly cardinality: "1:1" | "1:N" | "N:1";
  readonly on: {
    readonly local: readonly string[];
    readonly target: readonly string[];
  };
  readonly onDelete?: IdbReferentialAction;
};

export type IndexDef = {
  readonly keyPath: string;
  readonly unique?: boolean;
  readonly multiEntry?: boolean;
};

export type ModelDef = {
  readonly store: string;
  readonly key: string;
  /** All scalar fields on the model. Use `"Type"` for non-nullable, `"Type?"` for nullable. */
  readonly fields: Record<string, FieldSpec>;
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

// ── Helper: build ContractField entries from field specs ──────────────────────

function buildFields(fields: Record<string, FieldSpec>): Record<string, ContractField> {
  const result: Record<string, ContractField> = {};
  for (const [name, spec] of Object.entries(fields)) {
    const nullable = spec.endsWith("?");
    const typeName = (nullable ? spec.slice(0, -1) : spec) as PrismaScalarType;
    const codecId = SCALAR_TO_CODEC_ID[typeName];
    if (codecId === undefined) {
      throw new Error(`Unknown field type "${typeName}" for field "${name}"`);
    }
    result[name] = { nullable, type: { kind: "scalar" as const, codecId } };
  }
  return result;
}

// ── Helper: derive the `roots` map (storeName → model CrossReference) ─────────

function buildRoots(models: Record<string, ModelDef>): Record<string, CrossReference> {
  const roots: Record<string, CrossReference> = {};
  for (const modelName of Object.keys(models)) {
    const def = models[modelName]!;
    // v0.12.0: roots values are CrossReference `{ namespace, model }`, not bare
    // model-name strings. IDB has a single (unbound) namespace.
    roots[def.store] = crossRef(modelName);
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
  readonly fields: Record<string, ContractField>;
  readonly relations: Record<
    string,
    {
      readonly to: CrossReference;
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
    const relationsStorage: Record<string, { onDelete: IdbReferentialAction }> = {};
    for (const [relName, rel] of Object.entries(def.relations ?? {})) {
      relations[relName] = {
        // v0.12.0: relation `to` is a CrossReference, not a bare model-name string.
        to: crossRef(rel.to),
        cardinality: rel.cardinality,
        on: { localFields: rel.on.local, targetFields: rel.on.target },
      };
      if (rel.onDelete !== undefined) {
        relationsStorage[relName] = { onDelete: rel.onDelete };
      }
    }
    const storage: IdbModelStorage =
      Object.keys(relationsStorage).length > 0
        ? { storeName: def.store, keyPath: def.key, relations: relationsStorage }
        : { storeName: def.store, keyPath: def.key };
    result[modelName] = { fields: buildFields(def.fields), relations, storage };
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
 *       fields: { id: 'String', name: 'String?', email: 'String' },
 *       indexes: { byEmail: { keyPath: 'email', unique: true } },
 *     },
 *   },
 * });
 * ```
 */
export function defineContract(input: DefineContractInput): Contract<IdbStorage> {
  const stores = buildStores(input.models);

  // Mirror the capability surface that `prisma-next contract emit` writes
  // into the JSON contract — keeps the two authoring paths byte-equivalent
  // for the capabilities block. See ARCHITECTURE.md § "Key type: capabilities".
  const capabilities = {
    idb: {
      ddlOnlyInUpgrade: true,
      transactionalDDL: true,
    },
  };

  // v0.12.0 (ADR 221): both planes are namespace-keyed. IDB has no namespace
  // concept, so everything lives under the single unbound namespace.
  const ns = UNBOUND_DOMAIN_NAMESPACE_ID;
  const storageBlock = {
    stores,
    namespaces: { [ns]: { id: ns } },
  };

  const storageHash = computeStorageHash({
    target: "idb",
    targetFamily: "idb",
    storage: storageBlock,
  });

  const profileHash = computeProfileHash({
    target: "idb",
    targetFamily: "idb",
    capabilities,
  });

  const storage: IdbStorage = { ...storageBlock, storageHash };

  // v0.12.0: models live under `domain.namespaces.<ns>.models`, not a top-level
  // `models` field.
  const domain = {
    namespaces: { [ns]: { models: buildModels(input.models) } },
  } as unknown as ApplicationDomain;

  const contract: Contract<IdbStorage> = {
    target: "idb",
    targetFamily: "idb",
    roots: buildRoots(input.models),
    domain,
    storage,
    capabilities,
    extensionPacks: {},
    meta: {},
    profileHash,
  };

  validateContract(contract);

  return contract;
}
