import type { Contract } from "@prisma-next/contract/types";
import {
  ContractValidationError,
  validateContract as frameworkValidateContract,
} from "@prisma-next/contract/validate-contract";
import type { IdbModelStorage, IdbStorage } from "@prisma-next-idb/target-idb/pack";

/** Fully-typed IDB contract after validation. */
export type IdbContract = Contract<IdbStorage>;

/**
 * Validates the IDB-specific storage block of a contract.
 *
 * Runs as the third pass of {@link frameworkValidateContract} (after structural
 * and domain validation). Checks:
 *
 * 1. `storage.stores` is present and is an object.
 * 2. Every store has a non-empty `keyPath` string.
 * 3. Every model's `storage.storeName` references an existing store.
 *
 * @throws {@link ContractValidationError} with phase `'storage'` on failure.
 */
function validateIdbStorage(contract: Contract): void {
  const storage = contract.storage as unknown as Partial<IdbStorage> | undefined;

  if (!storage || typeof storage.stores !== "object" || storage.stores === null) {
    throw new ContractValidationError("IDB contract must have storage.stores (an object)", "storage");
  }

  // Validate each store has a keyPath.
  for (const [storeName, store] of Object.entries(storage.stores)) {
    if (!store || typeof store.keyPath !== "string" || store.keyPath === "") {
      throw new ContractValidationError(
        `Store "${storeName}" is missing a required non-empty keyPath string`,
        "storage"
      );
    }
  }

  // Validate model → store references.
  const storeNames = new Set(Object.keys(storage.stores));
  const models = contract.models as Record<string, { storage?: Partial<IdbModelStorage> }>;

  for (const [modelName, model] of Object.entries(models)) {
    const storeName = model.storage?.storeName;
    if (!storeName) {
      throw new ContractValidationError(`Model "${modelName}" is missing storage.storeName`, "storage");
    }
    if (!storeNames.has(storeName)) {
      throw new ContractValidationError(`Model "${modelName}" references non-existent store "${storeName}"`, "storage");
    }
  }
}

/**
 * Parses and validates a raw contract value against the IDB contract schema.
 *
 * Runs three validation passes (structural → domain → IDB storage) via the
 * framework's {@link frameworkValidateContract}. Throws a
 * {@link ContractValidationError} describing the first failure found.
 *
 * @param value - Raw contract value (e.g. parsed from `contract.json`).
 * @returns The validated, fully-typed {@link IdbContract}.
 */
export function validateContract(value: unknown): IdbContract {
  return frameworkValidateContract<IdbContract>(value, validateIdbStorage);
}
