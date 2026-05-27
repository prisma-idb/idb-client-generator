#!/usr/bin/env node
/**
 * `prisma-next-idb` — IDB-target-specific CLI tooling.
 *
 * Subcommands:
 *
 * - `generate-contract-space` — re-write
 *   `src/lib/prisma/contract-space.generated.ts` from the on-disk
 *   migrations/refs/app layout. (Phase 7.5)
 * - `preflight` — walk the migration chain from empty → tip against a
 *   `fake-indexeddb` shadow, reporting per-step success/failure.
 *   (Phase 7.6)
 *
 * Why a separate binary from `prisma-next`: the framework CLI is generic
 * (target-discovery via config); these commands are IDB-specific and
 * own an opinionated layout. Keeping them separate avoids growing the
 * framework CLI surface with target-specific subcommands.
 */
import { parseArgs } from "node:util";
import { generateContractSpace } from "../core/contract-space-codegen";

async function main(): Promise<number> {
  const { positionals } = parseArgs({ allowPositionals: true, strict: false });
  const subcommand = positionals[0];

  switch (subcommand) {
    case "generate-contract-space":
      return generateContractSpace({ cwd: process.cwd() });
    case "preflight": {
      const { runPreflight } = await import("../core/preflight");
      return runPreflight({ cwd: process.cwd() });
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
      "  prisma-next-idb generate-contract-space   Regenerate contract-space.generated.ts\n" +
      "  prisma-next-idb preflight                 Validate the migration chain against fake-indexeddb\n" +
      "  prisma-next-idb help                      Show this message\n"
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
