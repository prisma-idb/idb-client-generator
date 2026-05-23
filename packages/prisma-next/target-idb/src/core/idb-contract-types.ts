import type { StorageBase } from "@prisma-next/contract/types";

/**
 * Full storage shape for an IDB contract.
 *
 * Extends the framework {@link StorageBase} to carry the `storageHash` alongside
 * IDB-specific data: a map of object store names to their {@link IdbStoreDefinition}s.
 *
 * @template THash - Literal hash string embedded in the `storageHash` branded type.
 */
export type IdbStorage<THash extends string = string> = StorageBase<THash> & {
  readonly stores: Record<string, IdbStoreDefinition>;
};

/**
 * Configuration for a single IndexedDB object store.
 *
 * Mirrors the options accepted by `IDBDatabase.createObjectStore()`:
 * - `keyPath` — the property path used as the primary key (e.g. `"id"`).
 * - `autoIncrement` — when `true` IDB auto-generates integer keys. Omit (or `false`)
 *   for client-generated keys (UUID / CUID), which is the common case for syncable models.
 * - `indexes` — named secondary indexes on this store.
 */
export type IdbStoreDefinition = {
  readonly keyPath: string;
  readonly autoIncrement?: boolean;
  readonly indexes?: Record<string, IdbIndexDefinition>;
};

/**
 * Configuration for a single secondary index on an object store.
 *
 * Mirrors the options accepted by `IDBObjectStore.createIndex()`.
 */
export type IdbIndexDefinition = {
  readonly keyPath: string;
  readonly unique: boolean;
  readonly multiEntry?: boolean;
};

/**
 * Per-model storage metadata stored in `contract.models[ModelName].storage`.
 *
 * Tells the runtime (and the generated client) which object store owns this model
 * and which field is its primary key.
 */
export type IdbModelStorage = {
  readonly storeName: string;
  readonly keyPath: string;
};

/**
 * Type-maps structure for IDB contracts.
 *
 * IDB has no SQL-style operation types or query-operation types — those slots are
 * fixed to `Record<string, never>`. Only codec types and field I/O types vary.
 *
 * @template TCodecTypes          - Codec input/output pairs keyed by codec ID.
 * @template TFieldOutputTypes    - Per-model, per-field TypeScript output types.
 * @template TFieldInputTypes     - Per-model, per-field TypeScript input types.
 */
export type IdbTypeMaps<
  TCodecTypes extends Record<string, { output: unknown }> = Record<string, never>,
  TFieldOutputTypes extends Record<string, Record<string, unknown>> = Record<string, never>,
  TFieldInputTypes extends Record<string, Record<string, unknown>> = Record<string, never>,
> = {
  readonly codecTypes: TCodecTypes;
  readonly operationTypes: Record<string, never>;
  readonly queryOperationTypes: Record<string, never>;
  readonly fieldOutputTypes: TFieldOutputTypes;
  readonly fieldInputTypes: TFieldInputTypes;
};

/** @internal Phantom key used to attach {@link IdbTypeMaps} to a contract without widening the contract shape. */
type IdbTypeMapsPhantomKey = "__@prisma-next-idb/family-idb/typeMaps@__";

/**
 * Intersects a contract type with its type-maps via a phantom property.
 *
 * Mirrors `ContractWithTypeMaps` from `@prisma-next/sql-contract/types`. The phantom
 * property is optional and carries no runtime value — it exists solely so that
 * TypeScript-level utilities can extract `TTypeMaps` from a `Contract` type parameter.
 *
 * @template TContract  - The base contract type.
 * @template TTypeMaps  - The {@link IdbTypeMaps} instantiation to attach.
 */
export type IdbContractWithTypeMaps<TContract, TTypeMaps> = TContract & {
  readonly [K in IdbTypeMapsPhantomKey]?: TTypeMaps;
};

// ── Type-map extraction helpers ───────────────────────────────────────────────

/**
 * Extract the full {@link IdbTypeMaps} from a contract wrapped with
 * {@link IdbContractWithTypeMaps}. Returns `never` if the contract does not
 * carry type maps (e.g. a plain `Contract<IdbStorage>` without the phantom key).
 */
export type ExtractIdbTypeMaps<TContract> = TContract extends {
  readonly [K in IdbTypeMapsPhantomKey]?: infer TM;
}
  ? TM
  : never;

/**
 * Extract the `fieldOutputTypes` slot from a contract's type maps.
 *
 * Used by the IDB ORM client to resolve per-model, per-field TypeScript output
 * types from the emitted `IdbTypeMaps<CodecTypes, FieldOutputTypes, FieldInputTypes>`.
 */
export type ExtractIdbFieldOutputTypes<TContract> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is used as a wildcard for type inference; the actual constraint is Record<string, { output: unknown }> | Record<string, Record<string, unknown>>
  ExtractIdbTypeMaps<TContract> extends IdbTypeMaps<any, infer FO, any> ? FO : never;

/**
 * Extract the `fieldInputTypes` slot from a contract's type maps.
 *
 * Used by the IDB ORM client to resolve per-model, per-field TypeScript input
 * types (for `create()`, `where()`, etc.).
 */
export type ExtractIdbFieldInputTypes<TContract> =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- any is used as a wildcard for type inference
  ExtractIdbTypeMaps<TContract> extends IdbTypeMaps<any, any, infer FI> ? FI : never;
