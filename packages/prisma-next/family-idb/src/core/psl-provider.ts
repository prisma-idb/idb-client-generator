import { readFile } from "node:fs/promises";
import type { ContractConfig, ContractSourceDiagnostic } from "@prisma-next/config/config-types";
import { buildSymbolTable, rangeToPslSpan } from "@prisma-next/psl-parser";
import { withSeedDiagnostics } from "@prisma-next/psl-parser/interpret";
import type { ParseDiagnostic, SourceFile } from "@prisma-next/psl-parser/syntax";
import { parse } from "@prisma-next/psl-parser/syntax";
import { notOk } from "@prisma-next/utils/result";
import { extname, basename } from "pathe";
import { interpretPslDocumentToIdbContract, SCALAR_TO_CODEC_ID } from "./psl-interpreter";

function defaultOutputFromSchemaPath(schemaPath: string): string {
  const ext = extname(schemaPath);
  if (ext.length === 0) return `${schemaPath}.json`;
  const base = schemaPath.slice(0, -ext.length);
  if (basename(base) === "schema") {
    return `${base.slice(0, -"schema".length)}contract.json`;
  }
  return `${base}.json`;
}

function mapParseDiagnostics(
  diagnostics: readonly ParseDiagnostic[],
  sourceFile: SourceFile,
  sourceId: string
): ContractSourceDiagnostic[] {
  return diagnostics.map((d) => ({
    code: d.code as string,
    message: d.message,
    sourceId,
    span: rangeToPslSpan(d.range, sourceFile),
  }));
}

export interface PrismaIdbContractOptions {
  readonly output?: string;
}

/**
 * Creates a `ContractConfig` that reads an IDB schema from a `.prisma` file.
 *
 * Use this in `prisma-next.config.ts` as the `contract:` value when you prefer
 * PSL authoring over the TypeScript-first `defineContract()` helper.
 *
 * @example
 * ```ts
 * import { defineConfig } from '@prisma-next-idb/family-idb/config-types';
 * import { prismaIdbContract } from '@prisma-next-idb/family-idb/contract-psl';
 *
 * export default defineConfig({
 *   // ...
 *   contract: prismaIdbContract('./src/prisma/schema.prisma'),
 * });
 * ```
 *
 * The emitted `contract.json` lands next to the schema file by default
 * (`schema.prisma` → `contract.json`). Override with `options.output`.
 */
export function prismaIdbContract(schemaPath: string, options?: PrismaIdbContractOptions): ContractConfig {
  return {
    source: {
      inputs: [schemaPath],
      load: async (context) => {
        const [absoluteSchemaPath] = context.resolvedInputs;
        if (absoluteSchemaPath === undefined) {
          throw new Error(
            "prismaIdbContract: context.resolvedInputs is empty. The CLI config loader should populate it positional-matched with source.inputs."
          );
        }

        let schema: string;
        try {
          schema = await readFile(absoluteSchemaPath, "utf-8");
        } catch (error) {
          const message = String(error);
          return notOk({
            summary: `Failed to read Prisma schema at "${schemaPath}"`,
            diagnostics: [
              {
                code: "PSL_SCHEMA_READ_FAILED",
                message,
                sourceId: schemaPath,
              },
            ],
          });
        }

        const { document, sourceFile, diagnostics: parseDiagnostics } = parse(schema);
        const { table, diagnostics: symbolDiagnostics } = buildSymbolTable({
          document,
          sourceFile,
          scalarTypes: Object.keys(SCALAR_TO_CODEC_ID),
          pslBlockDescriptors: {},
        });

        // Do not short-circuit on provider-level diagnostics — the fault-tolerant
        // parser/symbol-table still produce a usable table, and the interpreter
        // may surface its own diagnostics in the same response.
        const seedDiagnostics = [
          ...mapParseDiagnostics(parseDiagnostics, sourceFile, schemaPath),
          ...mapParseDiagnostics(symbolDiagnostics, sourceFile, schemaPath),
        ];

        const interpreted = withSeedDiagnostics(interpretPslDocumentToIdbContract(table, schemaPath), seedDiagnostics);
        // Return the full Result so seed diagnostics (parse + symbol-table
        // findings) survive the success path — the config loader surfaces
        // them alongside the contract.
        return interpreted;
      },
    },
    output: options?.output ?? defaultOutputFromSchemaPath(schemaPath),
  };
}
