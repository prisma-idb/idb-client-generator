// Ported from @prisma-next/sql-contract-ts/src/config-types.ts.
// These helpers are fully family-agnostic — they wrap any Contract object
// in a ContractSourceProvider that the prisma-next CLI config loader understands.
import { pathToFileURL } from "node:url";
import type { ContractConfig } from "@prisma-next/config/config-types";
import type { Contract } from "@prisma-next/contract/types";
import { ok } from "@prisma-next/utils/result";
import { extname } from "pathe";

function defaultOutputFromContractPath(contractPath: string): string {
  const ext = extname(contractPath);
  if (ext.length === 0) return `${contractPath}.json`;
  return `${contractPath.slice(0, -ext.length)}.json`;
}

/**
 * Wraps an in-memory contract object for use in `prisma-next.config.ts`.
 *
 * Use this with the no-emit (TypeScript-first) workflow per ADR 006.
 *
 * @example
 * ```ts
 * import { typescriptContract } from '@prisma-next-idb/family-idb/config-types';
 * import contract from './prisma/contract';
 *
 * export default {
 *   family: idbFamily,
 *   target: idbTarget,
 *   contract: typescriptContract(contract, 'src/prisma/contract.json'),
 * };
 * ```
 */
export function typescriptContract(contract: Contract, output?: string): ContractConfig {
  return {
    source: {
      load: async () => ok(contract),
    },
    ...(output !== undefined ? { output } : {}),
  };
}

/**
 * Loads a contract from a TypeScript file at `contractPath` and wraps it for
 * use in `prisma-next.config.ts`. The file must export the contract as
 * `default` or `contract`.
 *
 * @example
 * ```ts
 * export default {
 *   contract: typescriptContractFromPath('./prisma/contract.ts'),
 * };
 * ```
 */
export function typescriptContractFromPath(contractPath: string, output?: string): ContractConfig {
  return {
    source: {
      inputs: [contractPath],
      load: async (context) => {
        const [absolutePath] = context.resolvedInputs;
        if (absolutePath === undefined) {
          throw new Error(
            "typescriptContractFromPath: context.resolvedInputs is empty. The CLI config loader should populate it positional-matched with source.inputs."
          );
        }
        const mod = await import(pathToFileURL(absolutePath).href);
        const contract: Contract | undefined = mod.default ?? mod.contract;
        if (contract === undefined) {
          throw new Error(
            `typescriptContractFromPath: module at "${absolutePath}" has no "default" or "contract" export.`
          );
        }
        return ok(contract);
      },
    },
    output: output ?? defaultOutputFromContractPath(contractPath),
  };
}
