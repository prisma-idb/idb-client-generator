import type CodeBlockWriter from "code-block-writer";
import type { DMMF } from "@prisma/generator-helper";

/**
 * Create TypeScript enum exports from Prisma schema enums
 * @param writer - Code block writer instance
 * @param enums - Array of DMMF enum definitions from Prisma schema
 */
export function createEnumsFile(writer: CodeBlockWriter, enums: readonly DMMF.DatamodelEnum[]) {
  writer.writeLine("// Auto-generated enum exports from Prisma schema");
  writer.blankLine();

  enums.forEach((enumType) => {
    writer.writeLine(`export const ${enumType.name} =`).block(() => {
      enumType.values.forEach((value) => {
        writer.writeLine(`${value.name}: "${value.name}",`);
      });
    });
    writer.blankLine();
  });
}
