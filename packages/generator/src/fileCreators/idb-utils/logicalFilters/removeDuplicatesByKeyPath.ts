import CodeBlockWriter from "code-block-writer";

export function addRemoveDuplicatesByKeyPath(writer: CodeBlockWriter) {
  writer.writeLine(`export function removeDuplicatesByKeyPath<T>(arrays: T[][], keyPath: string[]): T[]`).block(() => {
    writer
      .writeLine(`const seen = new Set<string>();`)
      .writeLine(`return arrays`)
      .writeLine(`.flatMap((el) => el)`)
      .writeLine(`.filter((item) => {`)
      .writeLine(`const key = JSON.stringify(keyPath.map((key) => item[key as keyof T]));`)
      .writeLine(`if (seen.has(key)) return false;`)
      .writeLine(`seen.add(key);`)
      .writeLine(`return true;`)
      .writeLine(`});`);
  });
}
