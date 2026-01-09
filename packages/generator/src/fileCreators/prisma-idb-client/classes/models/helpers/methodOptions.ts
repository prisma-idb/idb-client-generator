/**
 * Generates the secondary options parameter type signature for API methods
 * Handles both read-only and read-write transaction types
 */
export function getSecondaryOptionsType(isReadwrite: boolean): string {
  const txType = isReadwrite ? "IDBUtils.ReadwriteTransactionType" : "IDBUtils.TransactionType";
  return `{
    tx?: ${txType},
    silent?: boolean,
    addToOutbox?: boolean
  }`;
}

/**
 * Returns the options parameter string for method signatures
 * Use with writer chaining: .write(getOptionsParameter(false))
 */
export function getOptionsParameter(isReadwrite: boolean): string {
  const txType = isReadwrite ? "IDBUtils.ReadwriteTransactionType" : "IDBUtils.TransactionType";
  return `options?: {\ntx?: ${txType},\nsilent?: boolean,\naddToOutbox?: boolean\n}`;
}

/**
 * Returns the options setup code string for the beginning of methods
 * Use with writer chaining: .write(getOptionsSetup())
 */
export function getOptionsSetup(): string {
  return `const {\ntx: txOption,\nsilent = false,\naddToOutbox = true\n} = options ?? {};\nlet tx = txOption;\n`;
}
