#!/usr/bin/env node
/**
 * `prisma-next-idb` — IDB-target-specific CLI tooling.
 *
 * Mirrors `prisma-next`'s own `<group> <verb>` command shape (a project
 * using sync runs both CLIs side by side, so learning one shape should
 * cover both):
 *
 * - `migration plan` — plans the next migration package, auto-detecting
 *   whether this is the first (baseline, `from: null`) or an incremental
 *   migration by checking whether the target space already has any
 *   packages on disk. Also accepts `--space <id>` for extension-space
 *   migrations (ADR 212 contract-space package layout) — updates
 *   `migrations/refs/head.json` afterward.
 * - `migration contract-space` — re-writes
 *   `<contract-dir>/contract-space.generated.ts` (or the path specified by
 *   `--out`) from the on-disk `migrations/app/` packages.
 * - `migration preflight` — walks the migration chain from empty → tip
 *   against a `fake-indexeddb` shadow, reporting per-step success/failure.
 *
 * Why a separate binary from `prisma-next`: the framework CLI is generic
 * (target-discovery via config); these commands are IDB-specific and own an
 * opinionated layout. Keeping them separate avoids growing the framework CLI
 * surface with target-specific subcommands.
 *
 * `--contract` and `--migrations-dir` default to `prisma-next.config.ts`'s
 * `contract.output` / `migrations.dir` (loaded the same way `prisma-next
 * contract emit` does, via `@prisma-next/config-loader`) rather than a
 * hardcoded path — pass `--config <path>` if it isn't at the default
 * location, or `--contract`/`--migrations-dir` directly to skip config
 * loading for that value entirely.
 *
 * Typical new-project workflow:
 *   1. prisma-next contract emit                  # generate contract.json
 *   2. prisma-next-idb migration plan             # create migrations/app/<ts>_baseline/
 *   3. prisma-next-idb migration contract-space   # bundle into contract-space.generated.ts
 *   4. prisma-next-idb migration preflight        # (optional) validate chain in CI
 *
 * Adding a subsequent migration:
 *   1. prisma-next contract emit                  # update contract.json after schema change
 *   2. prisma-next-idb migration plan --name <slug>   # e.g. --name add_posts
 *   3. prisma-next-idb migration contract-space   # re-bundle contract-space.generated.ts
 *   4. prisma-next-idb migration preflight        # (optional) validate chain in CI
 */
import { Command } from "commander";
import packageJson from "../../package.json" with { type: "json" };
import type { ResolvedCliPaths } from "../core/resolve-cli-paths";
import { resolveCliPaths } from "../core/resolve-cli-paths";

interface SharedFlags {
  readonly config?: string;
  readonly contract?: string;
  readonly migrationsDir?: string;
}

function addSharedOptions(cmd: Command): Command {
  return cmd
    .option("--config <path>", "Path to prisma-next.config.ts (default: discovered from cwd)")
    .option("--contract <path>", "Path to contract.json (default: config.contract.output)")
    .option("--migrations-dir <path>", "Path to the migrations root (default: config.migrations.dir)");
}

async function resolvePaths(
  flags: SharedFlags,
  needs: { readonly contract: boolean; readonly contractSpaceOut: boolean; readonly out?: string }
): Promise<ResolvedCliPaths> {
  return resolveCliPaths({
    cwd: process.cwd(),
    ...(flags.config !== undefined && { configOption: flags.config }),
    overrides: {
      ...(flags.contract !== undefined && { contract: flags.contract }),
      ...(flags.migrationsDir !== undefined && { migrationsDir: flags.migrationsDir }),
      ...(needs.out !== undefined && { out: needs.out }),
    },
    needsContract: needs.contract,
    needsContractSpaceOut: needs.contractSpaceOut,
  });
}

/** User-actionable errors (bad config, missing files) print a message and exit 1 — no stack trace. */
async function runAction(fn: () => Promise<number>): Promise<void> {
  try {
    process.exitCode = await fn();
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 1;
  }
}

const program = new Command();
program.name("prisma-next-idb").description("IDB-target tooling for Prisma Next").version(packageJson.version);

const migrationCommand = new Command("migration").description("On-disk migration package management commands");

interface PlanFlags extends SharedFlags {
  readonly name?: string;
  readonly space?: string;
}

const planCommand = addSharedOptions(
  new Command("plan")
    .description("Plan the next migration package (auto-detects baseline vs. incremental)")
    .option("--name <slug>", 'Directory slug (default: "baseline" for a fresh space; required otherwise)')
    .option(
      "--space <id>",
      'Contract-space id (default: "app"). Non-app values write directly under the migrations root and pin/update migrations/refs/head.json — the ADR 212 layout extension packages (e.g. sync-extension-idb) use.'
    )
);
planCommand.action(async (flags: PlanFlags) => {
  await runAction(async () => {
    const { contractPath, migrationsDir } = await resolvePaths(flags, { contract: true, contractSpaceOut: false });
    const { migrationPlan } = await import("../core/migration-plan");
    return migrationPlan({
      migrationsDir,
      contractPath: contractPath!,
      ...(flags.name !== undefined && { name: flags.name }),
      ...(flags.space !== undefined && { spaceId: flags.space }),
    });
  });
});

interface ContractSpaceFlags extends SharedFlags {
  readonly out?: string;
}

const contractSpaceCommand = addSharedOptions(
  new Command("contract-space")
    .description("Regenerate contract-space.generated.ts from migrations/app/")
    .option("--out <path>", "Output file path (default: colocated with the resolved contract.json)")
);
contractSpaceCommand.action(async (flags: ContractSpaceFlags) => {
  await runAction(async () => {
    const { contractPath, migrationsDir, contractSpaceOutPath } = await resolvePaths(flags, {
      contract: true,
      contractSpaceOut: true,
      ...(flags.out !== undefined && { out: flags.out }),
    });
    const { generateContractSpace } = await import("../core/contract-space-codegen");
    return generateContractSpace({ migrationsDir, contractPath: contractPath!, outPath: contractSpaceOutPath! });
  });
});

const preflightCommand = addSharedOptions(
  new Command("preflight").description("Validate the migration chain against fake-indexeddb")
);
preflightCommand.action(async (flags: SharedFlags) => {
  await runAction(async () => {
    const { migrationsDir } = await resolvePaths(flags, { contract: false, contractSpaceOut: false });
    const { runPreflight } = await import("../core/preflight");
    return runPreflight({ migrationsDir });
  });
});

migrationCommand.addCommand(planCommand);
migrationCommand.addCommand(contractSpaceCommand);
migrationCommand.addCommand(preflightCommand);
program.addCommand(migrationCommand);

program.exitOverride();

async function main(): Promise<void> {
  if (process.argv.length <= 2) {
    program.outputHelp();
    process.exitCode = 0;
    return;
  }
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    // commander throws a CommanderError (via exitOverride) instead of calling
    // process.exit directly — its own help/usage/error output already went
    // to stdout/stderr, so just propagate the exit code.
    const code =
      typeof (err as { exitCode?: unknown }).exitCode === "number" ? (err as { exitCode: number }).exitCode : 1;
    process.exitCode = code;
  }
}

main();
