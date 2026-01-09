import CodeBlockWriter from "code-block-writer";

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
 * Writes the secondary options parameter to method signature
 */
export function writeOptionsParameter(writer: CodeBlockWriter, isReadwrite: boolean): void {
  const txType = isReadwrite ? "IDBUtils.ReadwriteTransactionType" : "IDBUtils.TransactionType";
  writer
    .writeLine(`options?: {`)
    .writeLine(`tx?: ${txType},`)
    .writeLine(`silent?: boolean,`)
    .writeLine(`addToOutbox?: boolean`)
    .writeLine(`}`);
}

/**
 * Writes the code to extract and setup options at the beginning of a method
 */
export function writeOptionsSetup(writer: CodeBlockWriter): void {
  writer
    .writeLine(`const {`)
    .writeLine(`tx: txOption,`)
    .writeLine(`silent = false,`)
    .writeLine(`addToOutbox = true`)
    .writeLine(`} = options ?? {};`)
    .writeLine(`let tx = txOption;`);
}
