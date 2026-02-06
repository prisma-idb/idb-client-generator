import type CodeBlockWriter from "code-block-writer";

export function createServerIndexFile(writer: CodeBlockWriter) {
  writer.writeLine(`export * from './batch-processor';`);
}
