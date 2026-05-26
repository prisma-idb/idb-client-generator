import type { ContractReferenceRelation } from "@prisma-next/contract/types";
import type {
  ExtractIdbFieldInputTypes,
  ExtractIdbFieldOutputTypes,
  IdbModelStorage,
  IdbStorage,
} from "@prisma-next-idb/target-idb/pack";
import type { Contract } from "@prisma-next/contract/types";

// Re-export for consumers who only import from client-idb
export type { IdbStorage };

// ── IdbContract convenience alias ─────────────────────────────────────────────

/**
 * A `Contract` narrowed to the IDB storage shape. Accepts any contract whose
 * `storage` block includes an `stores` record, regardless of the model set or
 * whether type maps are attached.
 */
export type IdbContract = Contract<IdbStorage>;

// ── Row type resolution (full type-maps path) ─────────────────────────────────

/**
 * Resolve the output row type for a model from the contract's type maps.
 *
 * When `fieldOutputTypes` is parameterised (the emitted contract carries
 * `IdbContractWithTypeMaps<Base, IdbTypeMaps<Codecs, FieldOutputTypes, ...>>`),
 * each field gets the exact TypeScript type emitted by the family (e.g. `Date`
 * for `idb/date@1`).
 *
 * Falls back to `Record<string, unknown>` when type maps are absent (plain
 * `IdbContract` or when the model name is not in the type maps).
 */
type ResolvedOutputRow<TContract, ModelName extends string> = string extends keyof ExtractIdbFieldOutputTypes<TContract>
  ? Record<string, unknown>
  : ModelName extends keyof ExtractIdbFieldOutputTypes<TContract>
    ? {
        -readonly [K in keyof ExtractIdbFieldOutputTypes<TContract>[ModelName]]: ExtractIdbFieldOutputTypes<TContract>[ModelName][K];
      }
    : Record<string, unknown>;

/**
 * Resolve the input row type for a model from the contract's type maps.
 *
 * Mirrors `ResolvedOutputRow` but uses `fieldInputTypes` — the input types
 * used for `create()`, `where()`, and mutation payloads.
 */
type ResolvedInputRow<TContract, ModelName extends string> = string extends keyof ExtractIdbFieldInputTypes<TContract>
  ? Record<string, unknown>
  : ModelName extends keyof ExtractIdbFieldInputTypes<TContract>
    ? {
        -readonly [K in keyof ExtractIdbFieldInputTypes<TContract>[ModelName]]: ExtractIdbFieldInputTypes<TContract>[ModelName][K];
      }
    : Record<string, unknown>;

// ── Public row types ──────────────────────────────────────────────────────────

/** The full TypeScript row shape returned by `all()`, `first()`, and `create()`. */
export type DefaultModelRow<TContract, ModelName extends string> = ResolvedOutputRow<TContract, ModelName>;

// ── Where filter ──────────────────────────────────────────────────────────────

/**
 * Partial equality filter applied as an in-memory predicate during cursor scans.
 *
 * All fields are optional — only provided fields are checked. Values use the
 * output types (from `fieldOutputTypes`) since the values are compared against
 * decoded row data.
 */
export type WhereFilter<TContract, ModelName extends string> = {
  readonly [K in keyof DefaultModelRow<TContract, ModelName>]?: DefaultModelRow<TContract, ModelName>[K];
};

// ── KeyPath / KeyType ─────────────────────────────────────────────────────────

/**
 * The literal `keyPath` string for a model, extracted from
 * `contract.models[ModelName].storage.keyPath`.
 *
 * Used at the type level to exclude the key field from `CreateInput` and to
 * narrow the `findUnique` / `delete` key parameter type.
 */
export type ModelKeyPath<TContract, ModelName extends string> = TContract extends {
  models: Record<ModelName, { storage: { keyPath: infer P } }>;
}
  ? P extends string
    ? P
    : never
  : never;

/**
 * TypeScript type of the primary key field for a given model.
 *
 * When the output row type has a field matching `ModelKeyPath`, that field's
 * type is used. Otherwise falls back to `IDBValidKey` (the DOM union of valid
 * IDB key types).
 */
export type KeyType<TContract, ModelName extends string> =
  ModelKeyPath<TContract, ModelName> extends keyof ResolvedOutputRow<TContract, ModelName>
    ? ResolvedOutputRow<TContract, ModelName>[ModelKeyPath<TContract, ModelName>]
    : IDBValidKey;

// ── Create input ──────────────────────────────────────────────────────────────

/** The keyPath field when it exists in the resolved input row (may be absent for models with no typed maps). */
type KeyPathField<TContract, ModelName extends string> = ModelKeyPath<TContract, ModelName> &
  keyof ResolvedInputRow<TContract, ModelName>;

/**
 * Input shape for `create()`: the full input row with the primary key field
 * made optional (IDB can generate keys via `autoIncrement`, or clients may
 * omit the key when using `cuid()` / `uuid()` at the application layer).
 */
export type CreateInput<TContract, ModelName extends string> = Omit<
  ResolvedInputRow<TContract, ModelName>,
  ModelKeyPath<TContract, ModelName>
> &
  Partial<Pick<ResolvedInputRow<TContract, ModelName>, KeyPathField<TContract, ModelName>>>;

// ── Relations ─────────────────────────────────────────────────────────────────

/** Extract the relations record for a model. */
type ModelRelations<TContract, ModelName extends string> = TContract extends {
  models: Record<ModelName, { relations: infer R }>;
}
  ? R extends Record<string, unknown>
    ? R
    : Record<string, never>
  : Record<string, never>;

/**
 * Union of relation keys on a model that are `ContractReferenceRelation`s
 * (i.e. cross-store joins, not embedded documents).
 *
 * Used to constrain the `include()` method's `relation` parameter to only
 * valid reference relation names.
 */
export type ReferenceRelKeys<TContract, ModelName extends string> = {
  [K in keyof ModelRelations<TContract, ModelName>]: ModelRelations<
    TContract,
    ModelName
  >[K] extends ContractReferenceRelation
    ? K
    : never;
}[keyof ModelRelations<TContract, ModelName>] &
  string;

/**
 * TypeScript row type for an included relation.
 *
 * - `1:N` cardinality → `RelatedRow[]`
 * - `N:1` or `1:1` cardinality → `RelatedRow | null`
 */
type RelationRowType<TContract, ModelName extends string, RelKey extends string> = RelKey extends keyof ModelRelations<
  TContract,
  ModelName
>
  ? ModelRelations<TContract, ModelName>[RelKey] extends ContractReferenceRelation
    ? ModelRelations<TContract, ModelName>[RelKey] extends {
        to: infer To extends string;
        cardinality: infer C;
      }
      ? C extends "1:N"
        ? DefaultModelRow<TContract, To>[]
        : DefaultModelRow<TContract, To> | null
      : never
    : never
  : never;

/** Which relations are included in the current accessor chain. */
export type IncludeSpec<TContract, ModelName extends string> = Partial<
  Record<ReferenceRelKeys<TContract, ModelName>, true>
>;

/** Empty include spec — no relations included. */
export type NoIncludes = Record<never, never>;

/**
 * A row type that merges the base model row with any included relation fields.
 *
 * The extra fields are only added when the corresponding key in `TIncludes` is
 * `true`, so the type stays narrow until `.include()` is called.
 */
export type IncludedRow<
  TContract,
  ModelName extends string,
  TIncludes extends IncludeSpec<TContract, ModelName>,
> = DefaultModelRow<TContract, ModelName> & {
  -readonly [K in keyof TIncludes & string as TIncludes[K] extends true ? K : never]: RelationRowType<
    TContract,
    ModelName,
    K
  >;
};

// ── Patch input ───────────────────────────────────────────────────────────────

/**
 * Partial update shape for `update()`, `updateAll()`, `updateCount()`, and the
 * `update` arm of `upsert()`. All fields are optional — only provided fields
 * are shallow-merged onto the existing record.
 */
export type PatchInput<TContract, ModelName extends string> = Partial<DefaultModelRow<TContract, ModelName>>;

// ── OrderBy spec ─────────────────────────────────────────────────────────────

/** Sort direction for `orderBy()`. */
export type SortDirection = "asc" | "desc";

/** Partial sort spec: field name → direction. */
export type OrderBySpec<TContract, ModelName extends string> = Partial<
  Record<string & keyof DefaultModelRow<TContract, ModelName>, SortDirection>
>;

// ── Model storage helpers ─────────────────────────────────────────────────────

/**
 * Extract the `storeName` from a model's storage metadata at runtime.
 * Falls back to the model name if `storeName` is absent.
 */
export function getStoreName(contract: IdbContract, modelName: string): string {
  const model = contract.models[modelName];
  return (model?.storage as IdbModelStorage | undefined)?.storeName ?? modelName;
}

/**
 * Extract the `keyPath` from a model's storage metadata at runtime.
 * Falls back to `"id"` (the invariant key name for all syncable IDB models).
 */
export function getKeyPath(contract: IdbContract, modelName: string): string {
  const model = contract.models[modelName];
  return (model?.storage as IdbModelStorage | undefined)?.keyPath ?? "id";
}
