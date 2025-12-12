import CodeBlockWriter from "code-block-writer";

export function addIntersectArraysByNestedKeyFunction(writer: CodeBlockWriter) {
  writer.writeLine(`export function intersectArraysByNestedKey<T>(arrays: T[][], keyPath: string[]): T[]`).block(() => {
    writer
      .writeLine(`return arrays.reduce((acc, array) =>`)
      .writeLine(
        `acc.filter((item) => array.some((el) => keyPath.every((key) => el[key as keyof T] === item[key as keyof T]))),`,
      )
      .writeLine(`);`);
  });
}
