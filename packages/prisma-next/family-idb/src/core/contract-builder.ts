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
import type { ContractProjection } from "./psl-interpreter";
import { warnDroppedRelation } from "./psl-interpreter";
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
  /** Server-only model — dropped when `defineContract` runs with `{ projection: "client" }`. See ADR 012. */
  readonly exclude?: boolean;
  /** Server-only fields on an otherwise-synced model — dropped in client projection. See ADR 012. */
  readonly excludeFields?: readonly string[];
};

export type DefineContractInput = {
  /** Pass the default export of `@prisma-next-idb/family-idb/pack`. */
  readonly family: { readonly familyId: "idb"; readonly id: string };
  /** Pass the default export of `@prisma-next-idb/target-idb/pack`. */
  readonly target: { readonly targetId: string; readonly id: string };
  readonly models: Record<string, ModelDef>;
};

export type DefineContractOptions = {
  /** @default "full" */
  readonly projection?: ContractProjection;
};

/**
 * Drops `exclude: true` models and `excludeFields` entries for the client
 * projection (ADR 012). Any relation a survivor still has to an excluded
 * model is dropped too (ADR 013) — for every cardinality, required or not;
 * the model itself is never excluded as a result (see ADR 013 §"Why we
 * don't cascade on requiredness"). The underlying FK scalar field (if any)
 * is kept, orphaned but inert.
 */
function projectModelsForClient(models: Record<string, ModelDef>): Record<string, ModelDef> {
  const excludedModelNames = new Set(
    Object.entries(models)
      .filter(([, def]) => def.exclude === true)
      .map(([name]) => name)
  );

  const result: Record<string, ModelDef> = {};

  for (const [modelName, def] of Object.entries(models)) {
    if (excludedModelNames.has(modelName)) continue;

    const excludedFields = new Set(def.excludeFields ?? []);

    if (excludedFields.has(def.key)) {
      throw new Error(
        `defineContract: model "${modelName}" excludes its own key field "${def.key}" — the client contract needs a primary key for every included model.`
      );
    }

    for (const excludedField of excludedFields) {
      if (excludedField === def.key) continue;
      if (!(excludedField in def.fields)) {
        throw new Error(
          `defineContract: model "${modelName}" excludeFields references unknown field "${excludedField}" — it is not declared in "fields".`
        );
      }
    }

    for (const [indexName, idx] of Object.entries(def.indexes ?? {})) {
      if (excludedFields.has(idx.keyPath)) {
        throw new Error(
          `defineContract: model "${modelName}" index "${indexName}" references excluded field "${idx.keyPath}". Remove the index or the exclusion.`
        );
      }
    }

    const relations: Record<string, RelationDef> = {};
    for (const [relName, rel] of Object.entries(def.relations ?? {})) {
      if (excludedModelNames.has(rel.to)) {
        warnDroppedRelation(modelName, relName, rel.to);
        continue;
      }
      const excludedLocalField = rel.on.local.find((f) => excludedFields.has(f));
      if (excludedLocalField !== undefined) {
        throw new Error(
          `defineContract: model "${modelName}" field "${excludedLocalField}" backs relation "${relName}" and cannot be excluded independently — field-level FK exclusion isn't supported (ADR 013 only handles relations pointing at a whole-model @@idb.exclude). Exclude the whole model instead, or remove the exclusion.`
        );
      }
      const targetExcludedFields = new Set(models[rel.to]?.excludeFields ?? []);
      const excludedTargetField = rel.on.target.find((f) => targetExcludedFields.has(f));
      if (excludedTargetField !== undefined) {
        throw new Error(
          `defineContract: model "${modelName}" relation "${relName}" references excluded field "${rel.to}.${excludedTargetField}" — field-level FK exclusion isn't supported (ADR 013 only handles relations pointing at a whole-model @@idb.exclude). Exclude the whole model instead, or remove the exclusion.`
        );
      }
      relations[relName] = rel;
    }

    const fields: Record<string, FieldSpec> = {};
    for (const [fieldName, spec] of Object.entries(def.fields)) {
      if (excludedFields.has(fieldName)) continue;
      fields[fieldName] = spec;
    }

    result[modelName] = { ...def, fields, relations };
  }

  return result;
}

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
export function defineContract(input: DefineContractInput, options?: DefineContractOptions): Contract<IdbStorage> {
  const projection: ContractProjection = options?.projection ?? "full";
  const models = projection === "client" ? projectModelsForClient(input.models) : input.models;
  const stores = buildStores(models);

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
    namespaces: { [ns]: { id: ns, entries: {} } },
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
    namespaces: { [ns]: { models: buildModels(models) } },
  } as unknown as ApplicationDomain;

  const contract: Contract<IdbStorage> = {
    target: "idb",
    targetFamily: "idb",
    roots: buildRoots(models),
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
