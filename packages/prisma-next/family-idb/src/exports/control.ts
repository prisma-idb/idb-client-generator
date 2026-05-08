import type {
  ControlFamilyDescriptor,
  ControlFamilyInstance,
  ControlStack,
} from "@prisma-next/framework-components/control";
import type { EmissionSpi } from "@prisma-next/framework-components/emission";
import type { Contract, ContractMarkerRecord } from "@prisma-next/contract/types";

/**
 * Code-generation plugin for the IDB family.
 *
 * The emitter calls these methods when generating `contract.d.ts` for any
 * schema that targets the IDB family. Each method must return a raw TypeScript
 * source string that the emitter splices into the generated file.
 */
class IdbEmissionSpi implements EmissionSpi {
  readonly id = "idb";

  /**
   * Returns a TypeScript type literal representing the full storage shape for
   * this contract. For IDB this should describe object stores and their key
   * paths, e.g.:
   *
   * ```ts
   * { readonly stores: { readonly users: { readonly keyPath: "id" } };
   *   readonly storageHash: <hashTypeName> }
   * ```
   *
   * @param contract - The resolved Prisma contract.
   * @param storageHashTypeName - The name of the hash type to embed (provided by emitter).
   */
  generateStorageType(_contract: Contract, _storageHashTypeName: string): string {
    throw new Error("TODO");
  }

  /**
   * Returns a TypeScript type literal for the per-model storage metadata.
   * For IDB this should describe which object store and key path the model
   * maps to, e.g.:
   *
   * ```ts
   * { readonly storeName: "users"; readonly keyPath: "id" }
   * ```
   *
   * @param _modelName - The Prisma model name (e.g. `"User"`).
   * @param _model - The resolved `ContractModel` for this model.
   */
  generateModelStorageType(_modelName: string, _model: unknown): string {
    throw new Error("TODO");
  }

  /**
   * Returns the `import type` lines to prepend to `contract.d.ts` for
   * IDB-family types. Should import the IDB contract wrapper type, e.g.:
   *
   * ```ts
   * ["import type { IdbContractWithTypeMaps } from '@prisma-next-idb/family-idb/types';"]
   * ```
   */
  getFamilyImports(): string[] {
    throw new Error("TODO");
  }

  /**
   * Returns additional type alias declarations appended to `contract.d.ts`.
   * At minimum should export `LaneCodecTypes` aliasing `CodecTypes`. May also
   * export convenience aliases like `Stores` or `Models`.
   */
  getFamilyTypeAliases(): string {
    throw new Error("TODO");
  }

  /**
   * Returns the TypeScript expression used as the `TypeMaps<...>` generic
   * instantiation in the generated contract. Wires together codec types,
   * operation types, and field I/O types into a single maps type.
   */
  getTypeMapsExpression(): string {
    throw new Error("TODO");
  }

  /**
   * Returns the final `export type Contract = ...` declaration and any
   * top-level convenience exports derived from it (e.g. `Stores`, `Models`).
   *
   * @param _contractBaseName - The name of the base contract type (provided by emitter).
   * @param _typeMapsName - The name of the assembled TypeMaps type (provided by emitter).
   */
  getContractWrapper(_contractBaseName: string, _typeMapsName: string): string {
    throw new Error("TODO");
  }
}

/**
 * Runtime control-plane instance for the IDB family.
 *
 * Created by `idbControlFamilyDescriptor.create(stack)` during CLI operations
 * (migrate, verify, sign, introspect). Methods here are called by the
 * framework CLI to validate and manage schema state.
 */
class IdbControlFamilyInstance implements ControlFamilyInstance<"idb", unknown> {
  readonly familyId = "idb" as const;

  /**
   * Parses and validates the raw contract JSON against the IDB contract schema.
   * Should throw a descriptive error if the contract is malformed or missing
   * required IDB-specific fields (e.g. `storage.stores`).
   */
  validateContract(_contractJson: unknown): Contract {
    throw new Error("TODO");
  }

  /**
   * Verifies that the live IDB database matches the expected contract.
   * For IDB this must read from the schema manifest file (not from a live
   * browser connection) since the CLI runs in Node and cannot open IndexedDB.
   */
  async verify(_options: unknown): Promise<never> {
    throw new Error("TODO");
  }

  /**
   * Verifies the IDB schema structure against the contract without requiring
   * a full migration state check. Used by `prisma validate`.
   */
  async schemaVerify(_options: unknown): Promise<never> {
    throw new Error("TODO");
  }

  /**
   * Writes a migration marker recording the applied contract version.
   * For IDB this should write to the schema manifest file on disk.
   */
  async sign(_options: unknown): Promise<never> {
    throw new Error("TODO");
  }

  /**
   * Reads the current migration marker from the schema manifest file.
   * Returns `null` if no marker exists (i.e. database has never been migrated).
   */
  async readMarker(_options: unknown): Promise<ContractMarkerRecord | null> {
    throw new Error("TODO");
  }

  /**
   * Introspects the current IDB schema and returns an IR representation.
   * For IDB this must read from the schema manifest file rather than opening
   * a live IndexedDB connection (which requires a browser origin).
   */
  async introspect(_options: unknown): Promise<unknown> {
    throw new Error("TODO");
  }
}

const idbControlFamilyDescriptor: ControlFamilyDescriptor<"idb"> = {
  kind: "family",
  familyId: "idb",
  id: "idb",
  version: "0.0.1",
  emission: new IdbEmissionSpi(),
  create(_stack: ControlStack<"idb", string>): IdbControlFamilyInstance {
    return new IdbControlFamilyInstance();
  },
};

export default idbControlFamilyDescriptor;
