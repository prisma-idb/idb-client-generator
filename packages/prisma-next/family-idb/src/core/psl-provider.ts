import { readFile } from "node:fs/promises";
import type { ContractConfig, ContractSourceDiagnostic } from "@prisma-next/config/config-types";
import type { PslDiagnostic } from "@prisma-next/framework-components/psl-ast";
import { parsePslDocument } from "@prisma-next/psl-parser";
import { notOk, ok } from "@prisma-next/utils/result";
import { extname, basename } from "pathe";
import { interpretPslDocumentToIdbContract } from "./psl-interpreter";

function defaultOutputFromSchemaPath(schemaPath: string): string {
  const ext = extname(schemaPath);
  if (ext.length === 0) return `${schemaPath}.json`;
  const base = schemaPath.slice(0, -ext.length);
  if (basename(base) === "schema") {
    return `${base.slice(0, -"schema".length)}contract.json`;
  }
  return `${base}.json`;
}

function mapPslDiagnostics(diagnostics: readonly PslDiagnostic[], sourceId: string): ContractSourceDiagnostic[] {
  return diagnostics.map((d) => ({
    code: d.code as string,
    message: d.message,
    sourceId,
    ...(d.span !== undefined ? { span: d.span } : {}),
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

        const {
          ast,
          diagnostics: parseDiagnostics,
          ok: parseOk,
        } = parsePslDocument({
          schema,
          sourceId: schemaPath,
        });

        const seedDiagnostics = mapPslDiagnostics(parseDiagnostics, schemaPath);

        if (!parseOk) {
          return notOk({
            summary: `Failed to parse Prisma schema at "${schemaPath}"`,
            diagnostics: seedDiagnostics,
          });
        }

        const interpreted = interpretPslDocumentToIdbContract(ast, schemaPath);
        if (!interpreted.ok) {
          return notOk({
            ...interpreted.failure,
            diagnostics: [...seedDiagnostics, ...interpreted.failure.diagnostics],
          });
        }

        if (seedDiagnostics.length > 0) {
          return notOk({
            summary: `PSL parse warnings in "${schemaPath}"`,
            diagnostics: seedDiagnostics,
          });
        }

        return ok(interpreted.value);
      },
    },
    output: options?.output ?? defaultOutputFromSchemaPath(schemaPath),
  };
}
