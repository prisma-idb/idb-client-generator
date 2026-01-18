/**
 * Generates the secondary options parameter type signature for READ API methods
 * Only includes transaction type since read operations don't emit events or use outbox
 */
export function getOptionsTypeRead(): string {
  return `{
    tx?: IDBUtils.TransactionType
  }`;
}

/**
 * Generates the secondary options parameter type signature for WRITE API methods
 * Includes transaction type, silent flag, and addToOutbox flag
 */
export function getOptionsTypeWrite(): string {
  return `{
    tx?: IDBUtils.ReadwriteTransactionType,
    silent?: boolean,
    addToOutbox?: boolean
  }`;
}

/**
 * Returns the options parameter string for READ method signatures
 * Use with writer chaining: .write(getOptionsParameterRead())
 */
export function getOptionsParameterRead(): string {
  return `options?: ${getOptionsTypeRead()}`;
}

/**
 * Returns the options parameter string for WRITE method signatures
 * Use with writer chaining: .write(getOptionsParameterWrite())
 */
export function getOptionsParameterWrite(): string {
  return `options?: ${getOptionsTypeWrite()}`;
}

/**
 * Returns the options setup code string for the beginning of READ methods
 * Use with writer chaining: .write(getOptionsSetupRead())
 */
export function getOptionsSetupRead(): string {
  return `const { tx: txOption } = options ?? {};\nlet tx = txOption;\n`;
}

/**
 * Returns the options setup code string for the beginning of WRITE methods
 * Use with writer chaining: .write(getOptionsSetupWrite())
 */
export function getOptionsSetupWrite(): string {
  return `const {\ntx: txOption,\nsilent = false,\naddToOutbox = true\n} = options ?? {};\nlet tx = txOption;\n`;
}
