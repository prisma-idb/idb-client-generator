/**
 * Create the secondary options type used by read API method signatures.
 *
 * The type includes an optional `tx` property of `IDBUtils.TransactionType`.
 *
 * @returns A string containing the TypeScript object type `{ tx?: IDBUtils.TransactionType }`.
 */
export function getOptionsTypeRead(): string {
  return `{
    tx?: IDBUtils.TransactionType
  }`;
}

/**
 * Generates the secondary options type for write API methods.
 *
 * @returns A string representing an object type with optional `tx` (`IDBUtils.ReadwriteTransactionType`), `silent`, and `addToOutbox` fields.
 */
export function getOptionsTypeWrite(): string {
  return `{
    tx?: IDBUtils.ReadwriteTransactionType,
    silent?: boolean,
    addToOutbox?: boolean
  }`;
}

/**
 * Generate the options parameter fragment used in read method signatures.
 *
 * @returns A string containing the TypeScript fragment `options?: { tx?: IDBUtils.TransactionType }`
 */
export function getOptionsParameterRead(): string {
  return `options?: {\ntx?: IDBUtils.TransactionType\n}`;
}

/**
 * Produces a TypeScript fragment for the `options` parameter used in write method signatures.
 *
 * @returns The string `options?: { tx?: IDBUtils.ReadwriteTransactionType, silent?: boolean, addToOutbox?: boolean }`
 */
export function getOptionsParameterWrite(): string {
  return `options?: {\ntx?: IDBUtils.ReadwriteTransactionType,\nsilent?: boolean,\naddToOutbox?: boolean\n}`;
}

/**
 * Generate the options destructuring and transaction initialization code used at the start of read methods.
 *
 * @returns A code string that destructures `tx` from `options` as `txOption` and initializes `let tx = txOption` (including trailing newlines).
 */
export function getOptionsSetupRead(): string {
  return `const { tx: txOption } = options ?? {};\nlet tx = txOption;\n`;
}

/**
 * Generate the code snippet that initializes write-method options and a local `tx` variable.
 *
 * Used when composing method bodies with writer chaining (e.g., `.write(getOptionsSetupWrite())`).
 *
 * @returns A TypeScript code string that destructures `options` into `tx: txOption`, `silent` (default `false`), and `addToOutbox` (default `true`), and then assigns `txOption` to a local `tx` variable.
 */
export function getOptionsSetupWrite(): string {
  return `const {\ntx: txOption,\nsilent = false,\naddToOutbox = true\n} = options ?? {};\nlet tx = txOption;\n`;
}