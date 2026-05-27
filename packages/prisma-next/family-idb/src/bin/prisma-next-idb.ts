#!/usr/bin/env node
/**
 * `prisma-next-idb` — IDB-target-specific CLI tooling.
 *
 * Subcommands:
 *
 * - `generate-baseline` — auto-generate the first migration package
 *   (`from: null`) from the current `contract.json`.  Only valid on a
 *   fresh project with no migrations yet.
 * - `generate-contract-space` — re-write
 *   `<project>/src/lib/prisma/contract-space.generated.ts` (or the path
 *   specified by `--out`) from the on-disk `migrations/app/` packages.
 * - `preflight` — walk the migration chain from empty → tip against a
 *   `fake-indexeddb` shadow, reporting per-step success/failure.
 *
 * Why a separate binary from `prisma-next`: the framework CLI is generic
 * (target-discovery via config); these commands are IDB-specific and own an
 * opinionated layout. Keeping them separate avoids growing the framework CLI
 * surface with target-specific subcommands.
 *
 * Typical new-project workflow:
 *   1. prisma-next contract emit               # generate contract.json
 *   2. prisma-next-idb generate-baseline       # create migrations/app/<ts>_baseline/
 *   3. prisma-next-idb generate-contract-space # bundle into contract-space.generated.ts
 *   4. prisma-next-idb preflight               # (optional) validate chain in CI
 */
import { parseArgs } from "node:util";
import { generateContractSpace } from "../core/contract-space-codegen";

/**
 * Flags shared across all subcommands.
 *
 * `--contract <path>` and `--migrations-dir <path>` let callers override the
 * defaults for any project layout (Next.js, Nuxt, plain Vite, etc.). Without
 * them the commands fall back to framework-conventional defaults, but those
 * defaults are just starting points — every project that uses a different
 * layout should pass explicit paths.
 */
interface ParsedFlags {
  /** Path to contract.json. */
  contract: string | undefined;
  /** Path to the migrations root (contains `app/` subdirectory). */
  migrationsDir: string | undefined;
  /** Output path for `generate-contract-space`. */
  out: string | undefined;
  /** Slug suffix for the baseline dir name (generate-baseline only). */
  name: string | undefined;
}

function parseFlags(): ParsedFlags {
  const { values } = parseArgs({
    allowPositionals: true,
    strict: false,
    options: {
      contract: { type: "string" },
      "migrations-dir": { type: "string" },
      out: { type: "string" },
      name: { type: "string" },
    },
  });
  return {
    // parseArgs with strict:false widens all values to string|boolean|undefined;
    // our options are all declared type:"string" so at runtime these are always
    // string|undefined — the cast is safe.
    contract: values["contract"] as string | undefined,
    migrationsDir: values["migrations-dir"] as string | undefined,
    out: values["out"] as string | undefined,
    name: values["name"] as string | undefined,
  };
}

async function main(): Promise<number> {
  const { positionals } = parseArgs({ allowPositionals: true, strict: false });
  const subcommand = positionals[0];
  const flags = parseFlags();

  switch (subcommand) {
    case "generate-baseline": {
      const { generateBaseline } = await import("../core/generate-baseline");
      return generateBaseline({
        cwd: process.cwd(),
        // exactOptionalPropertyTypes: omit the key entirely when undefined rather
        // than passing `key: undefined`, which violates the readonly optional contract.
        ...(flags.contract !== undefined && { contractPath: flags.contract }),
        ...(flags.migrationsDir !== undefined && { migrationsDir: flags.migrationsDir }),
        ...(flags.name !== undefined && { name: flags.name }),
      });
    }
    case "generate-contract-space":
      return generateContractSpace({
        cwd: process.cwd(),
        ...(flags.contract !== undefined && { contractPath: flags.contract }),
        ...(flags.migrationsDir !== undefined && { migrationsDir: flags.migrationsDir }),
        ...(flags.out !== undefined && { outPath: flags.out }),
      });
    case "preflight": {
      const { runPreflight } = await import("../core/preflight");
      return runPreflight({
        cwd: process.cwd(),
        ...(flags.migrationsDir !== undefined && { migrationsDir: flags.migrationsDir }),
      });
    }
    case undefined:
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return 0;
    default:
      process.stderr.write(`Unknown command: ${subcommand}\n\n`);
      printHelp();
      return 2;
  }
}

function printHelp(): void {
  process.stdout.write(
    "prisma-next-idb — IDB-target tooling for Prisma Next\n" +
      "\n" +
      "Usage:\n" +
      "  prisma-next-idb <command> [flags]\n" +
      "\n" +
      "Commands:\n" +
      "  generate-baseline         Create the initial migration package from contract.json\n" +
      "  generate-contract-space   Regenerate contract-space.generated.ts\n" +
      "  preflight                 Validate the migration chain against fake-indexeddb\n" +
      "  help                      Show this message\n" +
      "\n" +
      "Flags (all commands):\n" +
      "  --contract <path>         Path to contract.json (default: src/lib/prisma/contract.json)\n" +
      "  --migrations-dir <path>   Path to migrations root (default: migrations/)\n" +
      "\n" +
      "Flags (generate-baseline only):\n" +
      "  --name <slug>             Directory slug (default: baseline)\n" +
      "\n" +
      "Flags (generate-contract-space only):\n" +
      "  --out <path>              Output file path (default: src/lib/prisma/contract-space.generated.ts)\n" +
      "\n" +
      "New-project workflow:\n" +
      "  1. prisma-next contract emit                          # generate contract.json\n" +
      "  2. prisma-next-idb generate-baseline \\               # create baseline migration\n" +
      "       --contract src/prisma/contract.json             #   (if your layout differs)\n" +
      "  3. prisma-next-idb generate-contract-space \\         # bundle into contract-space.generated.ts\n" +
      "       --contract src/prisma/contract.json \\           #   (same override if needed)\n" +
      "       --out src/prisma/contract-space.generated.ts\n" +
      "  4. prisma-next-idb preflight                         # validate chain (CI)\n"
  );
}

main().then(
  (code) => {
    process.exit(code);
  },
  (err: unknown) => {
    process.stderr.write(`${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exit(1);
  }
);
