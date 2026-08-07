import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import type { IdbMigrationPlanWithAuthoring } from "@prisma-next-idb/target-idb/migration";
import { IdbMigrationPlanner, renderMigrationTs } from "@prisma-next-idb/target-idb/migration";
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
  /**
   * Contract-space identifier this baseline belongs to. Defaults to `"app"`.
   *
   * Passing a non-`"app"` value switches to **extension-space mode** (ADR 212
   * contract-space package layout):
   *
   * - The migration package is written directly under `migrationsDir` (no
   *   `app/` subdirectory — a contract-space package owns exactly one space,
   *   so the space-id directory would add no information).
   * - The `_prisma_next_marker` createObjectStore op the planner
   *   unconditionally prepends for `fromContract: null` is stripped from
   *   `ops.json` — the marker store belongs to the app space's own baseline;
   *   an extension space must never try to recreate it (see ADR 010/011).
   * - `migrations/refs/head.json` is written (hand-pinned per ADR 212;
   *   app-space baselines don't need this file since the app's headRef is
   *   derived by `generate-contract-space`, not read from a pinned ref).
   */
  readonly spaceId?: string;
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
  const spaceId = opts.spaceId ?? "app";
  const isAppSpace = spaceId === "app";
  const migrationsDir = opts.migrationsDir ?? join(opts.cwd, "migrations");
  // App-space packages nest under migrations/app/ (today's on-disk convention
  // for the consuming project). An extension-space package IS the contract
  // space — its migrations sit directly under migrationsDir (ADR 212: "no
  // <space-id> subdirectory inside migrations/").
  const targetDir = isAppSpace ? join(migrationsDir, "app") : migrationsDir;
  const contractPath = opts.contractPath ?? join(opts.cwd, "src/lib/prisma/contract.json");
  const name = opts.name ?? "baseline";

  // ── 1. Guard: refuse if any migration packages already exist ─────────────────
  // Two packages with from === null would break the chain-walk invariant in
  // chainOrderByMetadata. Keep this a strict first-run-only command.

  let existingDirs: string[] = [];
  try {
    const entries = await readdir(targetDir, { withFileTypes: true });
    existingDirs = entries
      .filter((e) => e.isDirectory())
      // `refs/` holds the pinned head ref, not a migration package. `app/` is
      // a sibling space's directory when it happens to share `migrationsDir`
      // with an extension space (not the normal layout — a contract-space
      // package owns exactly one space per ADR 212 — but defensive here so
      // an app-space baseline doesn't false-positive an extension's guard).
      .filter((e) => e.name !== "refs" && e.name !== "app")
      .map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // targetDir doesn't exist — that's the expected state for a fresh project.
  }

  if (existingDirs.length > 0) {
    const dirLabel = isAppSpace ? "migrations/app/" : "migrations/";
    process.stderr.write(
      `generate-baseline: ${dirLabel} already contains ${existingDirs.length} migration package(s):\n` +
        existingDirs.map((d) => `  ${d}`).join("\n") +
        "\n\n" +
        "Baseline generation is only for fresh projects with no migration history.\n" +
        (isAppSpace
          ? "Use `prisma-next migration plan` to add a new migration to the existing chain.\n"
          : "Use `prisma-next-idb generate-migration --name <slug> --space " +
            `${spaceId}\` to add the next migration to this space's chain.\n`)
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
  // for this case (see IdbMigrationPlanner.plan) — regardless of spaceId, so
  // extension-space mode strips it back out below (step 3b).

  const planner = new IdbMigrationPlanner();
  const planResult = planner.plan({
    contract: contractJson,
    schema: null, // no prior schema (fresh DB has no existing stores)
    policy: { allowedOperationClasses: ["additive", "widening", "destructive", "data"] },
    fromContract: null,
    frameworkComponents: [],
    spaceId,
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
  // ── 3b. Extension-space mode: strip the marker-store creation op ─────────────
  // The app space's own baseline creates _prisma_next_marker; an extension
  // space applying its DDL in the same combined transaction (ADR 011) would
  // hit ConstraintError trying to recreate a store that already exists.
  const ops = isAppSpace
    ? plan.operations
    : plan.operations.filter(
        (op) => !(op.kind === "createObjectStore" && (op as { storeName?: string }).storeName === "_prisma_next_marker")
      );
  const toHash = plan.destination.storageHash;

  // ── 4. Build content-addressed migration metadata ─────────────────────────────
  // Mirror the structure produced by prisma-next migration plan so
  // generate-contract-space / chainOrderByMetadata / preflight can consume this
  // package interchangeably with planner-generated ones.

  const timestamp = new Date();
  const dirName = formatMigrationDirName(timestamp, name);
  const packageDir = join(targetDir, dirName);

  const providedInvariants = Array.from(deriveProvidedInvariants(ops));
  const baseMetadata = {
    from: null as string | null,
    to: toHash,
    providedInvariants,
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
  // developer modifies the operations getter. Rendered from the filtered
  // `ops` (not `plan.renderTypeScript()`, which always renders
  // `plan.operations`) so extension-space baselines don't re-emit the
  // stripped marker-store op and drift from ops.json/migrationHash on rerun.
  await writeFile(join(packageDir, "migration.ts"), renderMigrationTs({ fromHash: null, toHash, ops }), "utf-8");

  // end-contract.json — snapshot of the contract state after this migration.
  // For the baseline, this is identical to the current contract.json.
  // The framework uses end-contract.json as the "from" snapshot when planning
  // the NEXT migration on top of this one.
  await writeFile(join(packageDir, "end-contract.json"), contractRaw, "utf-8");

  // end-contract.d.ts — TypeScript declaration companion to end-contract.json.
  // `prisma-next migration plan` copies this as `start-contract.d.ts` when
  // planning the next migration; without it, `migration plan` throws ENOENT.
  // The .d.ts lives at the same path stem as contract.json (contract.d.ts).
  const contractDtsPath = contractPath.replace(/\.json$/i, ".d.ts");
  try {
    await copyFile(contractDtsPath, join(packageDir, "end-contract.d.ts"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    process.stderr.write(
      `Warning: contract.d.ts not found at ${contractDtsPath}.\n` +
        (isAppSpace
          ? "`prisma-next migration plan` will fail when generating the next migration.\n"
          : "The next migration for this space will fail without it.\n") +
        "Run `prisma-next contract emit` first to generate contract.d.ts, then re-run generate-baseline.\n\n"
    );
  }

  // refs/head.json — hand-pinned per ADR 212, extension-space packages only.
  // `contractSpaceFromJson` (consumed by the package's exports/control.ts)
  // reads this to build the space's headRef without re-deriving it.
  if (!isAppSpace) {
    const refsDir = join(migrationsDir, "refs");
    await mkdir(refsDir, { recursive: true });
    await writeFile(
      join(refsDir, "head.json"),
      JSON.stringify({ hash: toHash, invariants: providedInvariants }, null, 2),
      "utf-8"
    );
  }

  const dirLabel = isAppSpace ? `migrations/app/${dirName}` : `migrations/${dirName}`;
  process.stdout.write(
    `Generated baseline migration at ${dirLabel}\n` +
      `  from: null  (fresh database — creates all stores from scratch)\n` +
      `  to:   ${toHash}\n` +
      `  ops:  ${ops.length} operation${ops.length === 1 ? "" : "s"}\n` +
      (isAppSpace
        ? `\nNext: run \`prisma-next-idb generate-contract-space\` to bundle into contract-space.generated.ts\n`
        : `\nAlso pinned migrations/refs/head.json → ${toHash}\n` +
          "Next: wire src/exports/control.ts to JSON-import contract.json, " +
          `migrations/${dirName}/{migration.json,ops.json}, and migrations/refs/head.json (ADR 212).\n`)
  );

  return 0;
}
