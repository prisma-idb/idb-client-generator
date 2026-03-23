import type CodeBlockWriter from "code-block-writer";

export function createClientIndexFile(
  writer: CodeBlockWriter,
  options: {
    outboxSync: boolean;
  }
) {
  const { outboxSync } = options;
  writer.writeLine(`export * from './prisma-idb-client';`);
  writer.writeLine(`export * from './idb-interface';`);
  writer.writeLine(`export * from './idb-utils';`);
  if (outboxSync) {
    writer.writeLine(`export * from './apply-pull';`);
  }
}
