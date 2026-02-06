import type CodeBlockWriter from "code-block-writer";

export function createClientIndexFile(writer: CodeBlockWriter, outboxSync: boolean) {
  writer.writeLine(`export * from './prisma-idb-client';`);
  writer.writeLine(`export * from './idb-interface';`);
  writer.writeLine(`export * from './idb-utils';`);
  if (outboxSync) {
    writer.writeLine(`export * from './apply-pull';`);
  }
}
