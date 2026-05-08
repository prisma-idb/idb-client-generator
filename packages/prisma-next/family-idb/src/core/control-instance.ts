import type { Contract, ContractMarkerRecord } from "@prisma-next/contract/types";
import type {
  ControlDriverInstance,
  ControlFamilyInstance,
  ControlStack,
  SignDatabaseResult,
  VerifyDatabaseResult,
  VerifyDatabaseSchemaResult,
} from "@prisma-next/framework-components/control";
import { validateContract } from "./validate";

/**
 * Schema IR type for IDB.
 *
 * Represents the on-disk manifest state used during CLI control-plane operations
 * (migrate, verify, introspect). IDB is browser-only so the CLI cannot open a
 * live IndexedDB connection — all control operations read/write a manifest file
 * instead.
 *
 * @remarks This is a placeholder shape. The full manifest schema will be defined
 * when the manifest-based control operations are implemented.
 */
export type IdbSchemaIR = {
  readonly stores: Record<string, { readonly keyPath: string; readonly autoIncrement?: boolean }>;
};

/** Fully-typed IDB control family instance returned by {@link createIdbFamilyInstance}. */
export type IdbControlFamilyInstance = ControlFamilyInstance<"idb", IdbSchemaIR>;

/**
 * Creates an IDB control family instance for the given control stack.
 *
 * The instance implements the {@link ControlFamilyInstance} interface consumed by
 * the Prisma Next CLI for `contract emit`, `db verify`, `db sign`, and related
 * commands.
 *
 * **What is implemented now:**
 * - `validateContract` — fully implemented via {@link validateContract}.
 *
 * **What is stubbed (throws):**
 * - `verify`, `schemaVerify`, `sign`, `readMarker`, `introspect` — these require
 *   reading/writing a manifest file on disk. They will be implemented when the
 *   manifest-based control operations are designed.
 *
 * @param _stack - The assembled control stack (unused until the manifest-based
 *                 operations are implemented).
 */
export function createIdbFamilyInstance(_stack: ControlStack<"idb", string>): IdbControlFamilyInstance {
  return {
    familyId: "idb",

    /**
     * Parses and validates a raw contract value against the IDB contract schema.
     * @see {@link validateContract} in `./validate.ts`.
     */
    validateContract(contractJson: unknown): Contract {
      return validateContract(contractJson);
    },

    /**
     * @throws Always — manifest-based verify is not yet implemented.
     * @todo Read the IDB schema manifest file and compare hashes against the
     *       expected contract. The driver parameter is intentionally unused for IDB
     *       since the manifest file lives on disk, not in the browser.
     */
    async verify(_options: unknown): Promise<VerifyDatabaseResult> {
      throw new Error("IDB verify: manifest-based control operations are not yet implemented");
    },

    /**
     * @throws Always — manifest-based schemaVerify is not yet implemented.
     * @todo Read the IDB schema manifest file and compare the store/index structure
     *       against the contract's `storage.stores`.
     */
    async schemaVerify(_options: unknown): Promise<VerifyDatabaseSchemaResult> {
      throw new Error("IDB schemaVerify: manifest-based control operations are not yet implemented");
    },

    /**
     * @throws Always — manifest-based sign is not yet implemented.
     * @todo Write the contract's storage hash to the IDB schema manifest file,
     *       creating or updating the file as needed.
     */
    async sign(_options: unknown): Promise<SignDatabaseResult> {
      throw new Error("IDB sign: manifest-based control operations are not yet implemented");
    },

    /**
     * @throws Always — manifest-based readMarker is not yet implemented.
     * @todo Read the stored contract marker (storageHash + profileHash) from the
     *       IDB schema manifest file. Return `null` if no marker exists.
     */
    async readMarker(_options: unknown): Promise<ContractMarkerRecord | null> {
      throw new Error("IDB readMarker: manifest-based control operations are not yet implemented");
    },

    /**
     * @throws Always — manifest-based introspect is not yet implemented.
     * @todo Read the IDB schema manifest file and return an {@link IdbSchemaIR}
     *       describing the current object stores and indexes.
     */
    async introspect(_options: unknown): Promise<IdbSchemaIR> {
      throw new Error("IDB introspect: manifest-based control operations are not yet implemented");
    },
  };
}

// Suppress unused-import warning: these types appear in stub return-type
// annotations above and are needed for interface satisfaction.
export type { ControlDriverInstance, SignDatabaseResult, VerifyDatabaseResult, VerifyDatabaseSchemaResult };
