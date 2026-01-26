import type CodeBlockWriter from "code-block-writer";

export function addAreUint8ArraysEqualHelper(writer: CodeBlockWriter): void {
  writer
    .writeLine(`function areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean`)
    .block(() => {
      writer
        .writeLine(`if (a.length !== b.length) return false;`)
        .writeLine(`for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;`)
        .writeLine(`return true;`);
    })
    .blankLine();
}
