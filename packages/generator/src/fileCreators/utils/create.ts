import { SourceFile } from "ts-morph";

export function createUtilsFile(idbUtilsFile: SourceFile) {
  idbUtilsFile.addFunction({
    name: "convertToArray",
    typeParameters: [{ name: "T" }],
    parameters: [{ name: "arg", type: "T | T[]" }],
    returnType: "T[]",
    isExported: true,
    statements: (writer) => writer.writeLine("return Array.isArray(arg) ? arg : [arg];"),
  });
}
