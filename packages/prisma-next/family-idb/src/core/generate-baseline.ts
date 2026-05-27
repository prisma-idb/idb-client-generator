import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import type { IdbMigrationPlanWithAuthoring } from "@prisma-next-idb/target-idb/migration";
import { IdbMigrationPlanner } from "@prisma-next-idb/target-idb/migration";
import { computeMigrationHash } from "@prisma-next/migration-tools/hash";
import { formatMigrationDirName } from "@prisma-next/migration-tools/io";
import { deriveProvidedInvariants } from "@prisma-next/migration-tools/invariants";
import { join } from "pathe";

/**
 * Options for {@link generateBaseline}.
 *
 * All paths default to framework-conventional values but **should be
 * overridden** if your project's layout differs. The defaults are:
 *
 * - migrations: `<cwd>/migrations/`
 * - contract:   `<cwd>/src/lib/prisma/contract.json`
 *
 * Pass explicit values (or the corresponding CLI flags) for any project
 * that keeps its contract and migrations elsewhere — Next.js, Nuxt,
 * plain Vite, etc. all typically use different paths.
 */
export interface GenerateBaselineOptions {
  readonly cwd: string;
  readonly migrationsDir?: string;
  readonly contractPath?: string;
  /**
   * Slug appended to the timestamped directory name.
   * Defaults to `"baseline"` → `<timestamp>_baseline/`.
   */
  readonly name?: string;
}

/**
 * Auto-generate the first ("baseline") migration package for an IDB project
 * that has no migrations yet.
 *
 * **What it does:**
 *
 * 1. Reads `contract.json` from the project.
 * 2. Runs {@link IdbMigrationPlanner} with `fromContract: null` to derive the
 *    complete DDL op list that creates the initial schema from scratch.
 * 3. Writes a fully-attested migration package to
 *    `<migrationsDir>/app/<timestamp>_<name>/`:
 *    - `ops.json`          — DDL operations for the runtime walker.
 *    - `migration.json`    — content-addressed manifest (`from: null`, `migrationHash`).
 *    - `migration.ts`      — class-based authoring scaffold (editable, self-emittable).
 *    - `end-contract.json` — snapshot of the contract after this migration (= `contract.json`).
 *
 * **When to use:**
 *
 * Run this exactly once, on a fresh project, before any other migrations
 * exist.  Once `migrations/app/` has at least one package, use
 * `prisma-next migration plan` (the framework CLI) to generate subsequent
 * migrations.
 *
 * **What NOT to use it for:**
 *
 * It refuses to run if `migrations/app/` already contains any directory —
 * generating a second baseline in the middle of an existing chain would
 * break `chainOrderByMetadata` (two packages with `from === null`).
 *
 * **Next step:**
 *
 * After this command succeeds, run:
 * ```bash
 * prisma-next-idb generate-contract-space
 * ```
 * to bundle the new package into `contract-space.generated.ts` so
 * `createAutoMigratingIdbClient` can consume it.
 *
 * Exit codes: 0 on success; 1 on user-actionable error.
 */
export async function generateBaseline(opts: GenerateBaselineOptions): Promise<number> {
  const migrationsDir = opts.migrationsDir ?? join(opts.cwd, "migrations");
  const appDir = join(migrationsDir, "app");
  const contractPath = opts.contractPath ?? join(opts.cwd, "src/lib/prisma/contract.json");
  const name = opts.name ?? "baseline";

  // ── 1. Guard: refuse if any migration packages already exist ─────────────────
  // Two packages with from === null would break the chain-walk invariant in
  // chainOrderByMetadata. Keep this a strict first-run-only command.

  let existingDirs: string[] = [];
  try {
    const entries = await readdir(appDir, { withFileTypes: true });
    existingDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // appDir doesn't exist — that's the expected state for a fresh project.
  }

  if (existingDirs.length > 0) {
    process.stderr.write(
      `generate-baseline: migrations/app/ already contains ${existingDirs.length} migration package(s):\n` +
        existingDirs.map((d) => `  ${d}`).join("\n") +
        "\n\n" +
        "Baseline generation is only for fresh projects with no migration history.\n" +
        "Use `prisma-next migration plan` to add a new migration to the existing chain.\n"
    );
    return 1;
  }

  // ── 2. Read contract.json ─────────────────────────────────────────────────────

  let contractRaw: string;
  let contractJson: unknown;
  try {
    contractRaw = await readFile(contractPath, "utf-8");
    contractJson = JSON.parse(contractRaw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      process.stderr.write(
        `generate-baseline: contract.json not found at ${contractPath}.\n` +
          "Run `prisma-next contract emit` first to generate the contract file.\n"
      );
      return 1;
    }
    throw err;
  }

  // ── 3. Plan: fromContract=null → current contract ─────────────────────────────
  // `fromContract: null` tells the planner "fresh database — create everything".
  // The planner also prepends the internal _prisma_next_marker store creation
  // for this case (see IdbMigrationPlanner.plan).

  const planner = new IdbMigrationPlanner();
  const planResult = planner.plan({
    contract: contractJson,
    schema: null, // no prior schema (fresh DB has no existing stores)
    policy: { allowedOperationClasses: ["additive", "widening", "destructive", "data"] },
    fromContract: null,
    frameworkComponents: [],
    spaceId: "app",
  });

  if (planResult.kind === "failure") {
    process.stderr.write(
      `generate-baseline: migration planning failed:\n` +
        planResult.conflicts.map((c) => `  ${c.summary}`).join("\n") +
        "\n"
    );
    return 1;
  }

  // Cast to the IDB-specific plan to access the typed operations.
  const plan = planResult.plan as IdbMigrationPlanWithAuthoring;
  const ops = plan.operations;
  const toHash = plan.destination.storageHash;

  // ── 4. Build content-addressed migration metadata ─────────────────────────────
  // Mirror the structure produced by prisma-next migration plan so
  // generate-contract-space / chainOrderByMetadata / preflight can consume this
  // package interchangeably with planner-generated ones.

  const timestamp = new Date();
  const dirName = formatMigrationDirName(timestamp, name);
  const packageDir = join(appDir, dirName);

  const baseMetadata = {
    from: null as string | null,
    to: toHash,
    hints: {
      used: [] as string[],
      applied: [] as string[],
      plannerVersion: "2.0.0",
    },
    labels: [] as string[],
    providedInvariants: Array.from(deriveProvidedInvariants(ops)),
    createdAt: timestamp.toISOString(),
  };
  // `computeMigrationHash` strips `migrationHash` before hashing, so it is safe
  // to pass `baseMetadata` (which doesn't have it yet) directly.
  const migrationHash = computeMigrationHash(
    baseMetadata,
    // IdbDdlOp satisfies MigrationPlanOperation structurally; the cast avoids a
    // strict-typed array invariance error from the migration-tools generic.
    ops as unknown as Parameters<typeof computeMigrationHash>[1]
  );
  const metadata = { ...baseMetadata, migrationHash };

  // ── 5. Write the package to disk ──────────────────────────────────────────────

  await mkdir(packageDir, { recursive: true });

  // ops.json — the DDL operations applied by the browser runtime.
  await writeFile(join(packageDir, "ops.json"), JSON.stringify(ops, null, 2), "utf-8");

  // migration.json — content-addressed manifest; read by chainOrderByMetadata,
  // generate-contract-space, and preflight.
  await writeFile(join(packageDir, "migration.json"), JSON.stringify(metadata, null, 2), "utf-8");

  // migration.ts — human-editable class-based scaffold.  Running it with
  // `node migration.ts` self-emits updated ops.json + migration.json if the
  // developer modifies the operations getter.
  await writeFile(join(packageDir, "migration.ts"), plan.renderTypeScript(), "utf-8");

  // end-contract.json — snapshot of the contract state after this migration.
  // For the baseline, this is identical to the current contract.json.
  // The framework uses end-contract.json as the "from" snapshot when planning
  // the NEXT migration on top of this one.
  await writeFile(join(packageDir, "end-contract.json"), contractRaw, "utf-8");

  process.stdout.write(
    `Generated baseline migration at migrations/app/${dirName}\n` +
      `  from: null  (fresh database — creates all stores from scratch)\n` +
      `  to:   ${toHash}\n` +
      `  ops:  ${ops.length} operation${ops.length === 1 ? "" : "s"}\n` +
      `\nNext: run \`prisma-next-idb generate-contract-space\` to bundle into contract-space.generated.ts\n`
  );

  return 0;
}
