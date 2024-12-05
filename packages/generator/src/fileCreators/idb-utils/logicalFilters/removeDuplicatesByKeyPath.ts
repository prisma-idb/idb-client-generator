import type { SourceFile } from "ts-morph";

export function addRemoveDuplicatesByKeyPath(utilsFile: SourceFile) {
  utilsFile.addFunction({
    name: "removeDuplicatesByKeyPath",
    isExported: true,
    typeParameters: [{ name: "T" }],
    parameters: [
      { name: "arrays", type: "T[][]" },
      { name: "keyPath", type: "string[]" },
    ],
    returnType: "T[]",
    statements: (writer) => {
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
    },
  });
}
