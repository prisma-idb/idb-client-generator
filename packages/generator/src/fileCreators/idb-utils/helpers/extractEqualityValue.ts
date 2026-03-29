import type CodeBlockWriter from "code-block-writer";

/**
 * Generates the `extractEqualityValue` utility function in idb-utils.ts.
 *
 * The generated function extracts a concrete equality value from a Prisma `where` field filter.
 * It handles direct values (string, number, Date, Uint8Array) and unwraps `{ equals: ... }` wrappers.
 * Returns `undefined` when the filter is not an equality check, signaling that an index cannot be used.
 */
export function addExtractEqualityValue(writer: CodeBlockWriter) {
  writer.blankLine();
  writer
    .writeLine(
      "export function extractEqualityValue(whereFieldValue: unknown): string | number | Date | Uint8Array | undefined"
    )
    .block(() => {
      writer
        .writeLine("if (whereFieldValue === undefined || whereFieldValue === null) return undefined;")
        .writeLine("if (whereFieldValue instanceof Date) return whereFieldValue;")
        .writeLine(
          "if (typeof whereFieldValue === 'string' || typeof whereFieldValue === 'number') return whereFieldValue;"
        )
        .writeLine("if (whereFieldValue instanceof Uint8Array) return whereFieldValue;")
        .writeLine("if (typeof whereFieldValue === 'object' && !Array.isArray(whereFieldValue))")
        .block(() => {
          writer.writeLine("if ('equals' in (whereFieldValue as object))").block(() => {
            writer.writeLine("return extractEqualityValue((whereFieldValue as Record<string, unknown>).equals);");
          });
        })
        .writeLine("return undefined;");
    });
}
