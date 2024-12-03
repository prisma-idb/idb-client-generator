import type { SourceFile } from "ts-morph";

export function addIntersectArraysByNestedKeyFunction(utilsFile: SourceFile) {
  utilsFile.addFunction({
    name: "intersectArraysByNestedKey",
    isExported: true,
    typeParameters: [{ name: "T" }],
    parameters: [
      { name: "arrays", type: "T[][]" },
      { name: "keyPath", type: "string[]" },
    ],
    returnType: "T[]",
    statements: (writer) => {
      writer
        .writeLine(`return arrays.reduce((acc, array) =>`)
        .writeLine(
          `acc.filter((item) => array.some((el) => keyPath.every((key) => el[key as keyof T] === item[key as keyof T]))),`,
        )
        .writeLine(`);`);
    },
  });
}
