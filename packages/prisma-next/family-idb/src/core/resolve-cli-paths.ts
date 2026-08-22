import { loadConfig } from "@prisma/orm-toolchain/config-loader";
import type { PrismaNextConfig } from "@prisma/orm-toolchain/config-loader";
import { dirname, join, resolve } from "pathe";

/**
 * Explicit `--contract` / `--migrations-dir` / `--out` values from the CLI.
 * Any value present here wins over whatever `prisma-next.config.ts` says.
 */
export interface CliPathOverrides {
  readonly contract?: string;
  readonly migrationsDir?: string;
  readonly out?: string;
}

export interface ResolveCliPathsOptions {
  readonly cwd: string;
  /** Raw `--config` flag value, or undefined to let config-loader discover it. */
  readonly configOption?: string;
  readonly overrides: CliPathOverrides;
  /** `false` for `migration preflight`, which never reads the contract. */
  readonly needsContract: boolean;
  /** `true` only for `migration contract-space`. */
  readonly needsContractSpaceOut: boolean;
}

export interface ResolvedCliPaths {
  readonly contractPath?: string;
  readonly migrationsDir: string;
  readonly contractSpaceOutPath?: string;
}

/**
 * Resolves the paths `prisma-next-idb` subcommands operate on, preferring
 * `prisma-next.config.ts` (via `@prisma-next/config-loader`'s `loadConfig`,
 * the same loader `prisma-next contract emit` uses) over hardcoded
 * conventions. Explicit CLI flags always win and, if they alone cover
 * everything a command needs, `prisma-next.config.ts` is never touched.
 */
export async function resolveCliPaths(opts: ResolveCliPathsOptions): Promise<ResolvedCliPaths> {
  const needsConfig =
    (opts.needsContract && opts.overrides.contract === undefined) ||
    opts.overrides.migrationsDir === undefined ||
    (opts.needsContractSpaceOut && opts.overrides.out === undefined);

  let config: PrismaNextConfig | undefined;
  if (needsConfig) {
    const loaded = await loadConfig(opts.configOption);
    if (!loaded.ok) {
      throw new Error(`prisma-next-idb: failed to load config — ${loaded.failure.message}`);
    }
    config = loaded.value.config;
    const familyId = config.family?.familyId;
    if (familyId !== "idb") {
      throw new Error(
        `prisma-next-idb: config family is "${familyId ?? "unknown"}", expected "idb".\n` +
          "This CLI operates on IDB-family projects only. Point --config at your browser-side " +
          "prisma-next.config.ts (the one using @prisma-next-idb/family-idb)."
      );
    }
  }

  const configDir = opts.configOption ? resolve(opts.cwd, opts.configOption, "..") : opts.cwd;

  const contractPath = opts.needsContract
    ? opts.overrides.contract !== undefined
      ? resolve(opts.cwd, opts.overrides.contract)
      : requireContractOutput(config!)
    : undefined;

  const migrationsDir =
    opts.overrides.migrationsDir !== undefined
      ? resolve(opts.cwd, opts.overrides.migrationsDir)
      : resolve(configDir, config!.migrations?.dir ?? "migrations");

  const contractSpaceOutPath = opts.needsContractSpaceOut
    ? opts.overrides.out !== undefined
      ? resolve(opts.cwd, opts.overrides.out)
      : join(dirname(contractPath!), "contract-space.generated.ts")
    : undefined;

  return {
    ...(contractPath !== undefined && { contractPath }),
    migrationsDir,
    ...(contractSpaceOutPath !== undefined && { contractSpaceOutPath }),
  };
}

function requireContractOutput(config: PrismaNextConfig): string {
  const output = config.contract?.output;
  if (output === undefined) {
    throw new Error(
      "prisma-next-idb: config.contract.output is required to resolve the contract path.\n" +
        "Ensure your prisma-next.config.ts sets `contract:` (e.g. via prismaIdbContract(...) or " +
        "typescriptContract(...)), or pass --contract explicitly."
    );
  }
  // Already absolute — @prisma/orm-toolchain/config-loader's finalizeConfig resolves
  // contract.output against the config file's directory before returning it.
  return output;
}
