import CodeBlockWriter from "code-block-writer";

export function addRemoveDuplicatesByKeyPath(writer: CodeBlockWriter) {
  writer.writeLine(`export function removeDuplicatesByKeyPath<T>(arrays: T[][], keyPath: string[]): T[]`).block(() => {
    writer
      .writeLine(`const seen = new Set<string>();`)
      .writeLine(`return arrays`)
      .writeLine(`.flatMap((el) => el)`)
      .writeLine(`.filter((item) => {`)
      .writeLine(`const key = JSON.stringify(`)
      .indent(() => {
        writer.writeLine(`keyPath.map((key) => {`);
        writer.indent(() => {
          writer.writeLine(`const v = item[key as keyof T];`);
          writer.writeLine(`return typeof v === "bigint" ? v.toString() : v instanceof Date ? v.toISOString() : v;`);
        });
        writer.writeLine(`})`);
      })
      .writeLine(`);`)
      .writeLine(`if (seen.has(key)) return false;`)
      .writeLine(`seen.add(key);`)
      .writeLine(`return true;`)
      .writeLine(`});`);
  });
}
