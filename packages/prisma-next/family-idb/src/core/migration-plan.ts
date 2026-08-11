import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import type { Contract } from "@prisma-next/contract/types";
import type { IdbMigrationPlanWithAuthoring } from "@prisma-next-idb/target-idb/migration";
import { IdbMigrationPlanner, contractToIdbSchema, renderMigrationTs } from "@prisma-next-idb/target-idb/migration";
import { computeMigrationHash } from "@prisma-next/migration-tools/hash";
import { formatMigrationDirName } from "@prisma-next/migration-tools/io";
import { deriveProvidedInvariants } from "@prisma-next/migration-tools/invariants";
import { join, relative } from "pathe";
import { chainOrderByMetadata } from "./chain-order";

export interface MigrationPlanOptions {
  readonly migrationsDir: string;
  readonly contractPath: string;
  /**
   * Directory slug. Defaults to `"baseline"` when this turns out to be a
   * fresh (greenfield) space. **Required** when a prior migration package
   * is found (incremental mode) — this function returns exit code 2 if
   * omitted in that case, since which mode applies isn't known until the
   * on-disk chain has been inspected.
   */
  readonly name?: string;
  /** Contract-space identifier. Defaults to `"app"`. See ADR 212. */
  readonly spaceId?: string;
}

/**
 * Plans the next migration package for an IDB project, auto-detecting
 * whether this is the first ("greenfield"/baseline, `from: null`) or an
 * incremental migration (diffed against the current head) by checking
 * whether `<migrationsDir>/app/` (or `<migrationsDir>/` for an extension
 * space) already contains any migration packages.
 *
 * This mirrors `prisma-next migration plan`'s job — one command instead of
 * a baseline/incremental split the caller has to pick correctly — but
 * *not* its `from: null`-unless-ref default: that default exists there
 * because prisma-next's on-disk chain can diverge from a live, separately
 * migrated database (tracked via the `db` ref, advanced by `prisma-next
 * migrate --advance-ref db`). IDB has no such divergence — there is no
 * `db update`/`migrate` step on the Node side at all (`db init`/`db
 * update`/`db verify` are refusal-only for IDB), so the on-disk chain is
 * the only state that will ever exist; the browser runtime applies it
 * wholesale at open time. Trusting the on-disk chain as the auto-detected
 * `from` is therefore the safety-equivalent of prisma-next's ref system
 * for this target, not a corner-cut.
 *
 * Exit codes: 0 on success; 1 on a planning/consistency failure; 2 if
 * `--name` was required (incremental mode) and not supplied.
 */
export async function migrationPlan(opts: MigrationPlanOptions): Promise<number> {
  const spaceId = opts.spaceId ?? "app";
  const isAppSpace = spaceId === "app";
  const targetDir = isAppSpace ? join(opts.migrationsDir, "app") : opts.migrationsDir;
  // Relative-to-cwd display path — reflects wherever `migrationsDir` actually
  // resolved to (config-driven, an override, or the framework convention),
  // not a hardcoded "migrations/..." literal that would go stale for any
  // project not using the default layout.
  const dirLabel = `${relative(process.cwd(), targetDir)}/`;

  let existingDirs: string[] = [];
  try {
    const entries = await readdir(targetDir, { withFileTypes: true });
    existingDirs = entries
      .filter((e) => e.isDirectory())
      // `refs/` holds the pinned head ref, not a migration package. `app/`
      // is a sibling space's directory when an extension space happens to
      // share `migrationsDir` with the app space (non-standard, but
      // defensive here — see ADR 212).
      .filter((e) => e.name !== "refs" && e.name !== "app")
      .map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    // targetDir doesn't exist yet — expected for a fresh project.
  }

  const ctx: SharedCtx = { ...opts, spaceId, isAppSpace, targetDir, dirLabel };

  if (existingDirs.length === 0) {
    process.stderr.write(
      `migration plan: no existing migrations found under ${dirLabel} — generating a full baseline.\n` +
        "If you expected an incremental migration, check --migrations-dir / your config's migrations.dir.\n"
    );
    return planGreenfield(ctx);
  }

  return planIncremental(ctx, existingDirs);
}

interface SharedCtx extends MigrationPlanOptions {
  readonly spaceId: string;
  readonly isAppSpace: boolean;
  readonly targetDir: string;
  readonly dirLabel: string;
}

async function planGreenfield(ctx: SharedCtx): Promise<number> {
  const name = ctx.name ?? "baseline";

  let contractRaw: string;
  let contractJson: unknown;
  try {
    contractRaw = await readFile(ctx.contractPath, "utf-8");
    contractJson = JSON.parse(contractRaw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      process.stderr.write(
        `migration plan: contract.json not found at ${ctx.contractPath}.\n` +
          "Run `prisma-next contract emit` first to generate the contract file.\n"
      );
      return 1;
    }
    throw err;
  }

  const planner = new IdbMigrationPlanner();
  const planResult = planner.plan({
    contract: contractJson,
    schema: null,
    policy: { allowedOperationClasses: ["additive", "widening", "destructive", "data"] },
    fromContract: null,
    frameworkComponents: [],
    spaceId: ctx.spaceId,
  });

  if (planResult.kind === "failure") {
    process.stderr.write(
      "migration plan: migration planning failed:\n" +
        planResult.conflicts.map((c) => `  ${c.summary}`).join("\n") +
        "\n"
    );
    return 1;
  }

  const plan = planResult.plan as IdbMigrationPlanWithAuthoring;
  // The planner unconditionally prepends `_prisma_next_marker` creation for
  // `fromContract: null`, regardless of spaceId — the app space's own
  // baseline creates that store; an extension space applying its DDL in
  // the same combined transaction (ADR 011) must not try to recreate it.
  const ops = ctx.isAppSpace
    ? plan.operations
    : plan.operations.filter(
        (op) => !(op.kind === "createObjectStore" && (op as { storeName?: string }).storeName === "_prisma_next_marker")
      );
  const toHash = plan.destination.storageHash;

  const timestamp = new Date();
  const dirName = formatMigrationDirName(timestamp, name);
  const providedInvariants = Array.from(deriveProvidedInvariants(ops));
  const baseMetadata = {
    from: null as string | null,
    to: toHash,
    providedInvariants,
    createdAt: timestamp.toISOString(),
  };
  const migrationHash = computeMigrationHash(
    baseMetadata,
    ops as unknown as Parameters<typeof computeMigrationHash>[1]
  );
  const metadata = { ...baseMetadata, migrationHash };

  await writeMigrationPackage(ctx, {
    dirName,
    ops,
    metadata,
    migrationTsContent: renderMigrationTs({ fromHash: null, toHash, ops }),
    contractRaw,
    providedInvariants,
    fromLabel: "null  (fresh database — creates all stores from scratch)",
    toHash,
    logVerb: "Generated baseline migration",
  });

  return 0;
}

async function planIncremental(ctx: SharedCtx, existingDirs: readonly string[]): Promise<number> {
  if (ctx.name === undefined) {
    process.stderr.write("migration plan: --name <slug> is required when generating an incremental migration.\n");
    return 2;
  }

  const packages = new Map<string, { dirName: string; metadata: { from: string | null; to: string } }>();
  for (const dirName of existingDirs) {
    const metaPath = join(ctx.targetDir, dirName, "migration.json");
    let metaRaw: string;
    try {
      metaRaw = await readFile(metaPath, "utf-8");
    } catch {
      process.stderr.write(`migration plan: cannot read ${metaPath} — skipping ${dirName}.\n`);
      continue;
    }
    const meta = JSON.parse(metaRaw) as { from: string | null; to: string };
    packages.set(dirName, { dirName, metadata: meta });
  }

  let ordered: { dirName: string; metadata: { from: string | null; to: string } }[];
  try {
    ordered = chainOrderByMetadata(packages);
  } catch (err) {
    process.stderr.write(
      `migration plan: migration chain is broken — ${err instanceof Error ? err.message : String(err)}\n`
    );
    return 1;
  }

  const head = ordered[ordered.length - 1];
  if (head === undefined) {
    process.stderr.write("migration plan: no valid migration packages could be read.\n");
    return 1;
  }

  const headEndContractPath = join(ctx.targetDir, head.dirName, "end-contract.json");
  let fromContractJson: unknown;
  try {
    const fromContractRaw = await readFile(headEndContractPath, "utf-8");
    fromContractJson = JSON.parse(fromContractRaw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      process.stderr.write(
        `migration plan: end-contract.json not found in head migration ${head.dirName}.\n` +
          "Re-emit the head migration with `node migration.ts`, or regenerate the chain.\n"
      );
      return 1;
    }
    throw err;
  }

  const headEndStorageHash = readStorageHash(fromContractJson);
  if (headEndStorageHash === null) {
    process.stderr.write(
      `migration plan: head migration ${head.dirName}/end-contract.json is missing storage.storageHash.\n` +
        "Re-emit the head migration before generating the next package.\n"
    );
    return 1;
  }

  if (head.metadata.to !== headEndStorageHash) {
    process.stderr.write(
      `migration plan: head migration ${head.dirName} is inconsistent.\n` +
        `  migration.json to:        ${head.metadata.to}\n` +
        `  end-contract storageHash: ${headEndStorageHash}\n` +
        "Re-emit or repair the head migration before generating the next package.\n"
    );
    return 1;
  }

  let contractRaw: string;
  let contractJson: unknown;
  try {
    contractRaw = await readFile(ctx.contractPath, "utf-8");
    contractJson = JSON.parse(contractRaw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      process.stderr.write(
        `migration plan: contract.json not found at ${ctx.contractPath}.\n` +
          "Run `prisma-next contract emit` first to generate the contract file.\n"
      );
      return 1;
    }
    throw err;
  }

  // fromContract is never null here, so the planner never prepends the
  // _prisma_next_marker op — no stripping needed, unlike the greenfield path.
  const fromSchema = contractToIdbSchema(fromContractJson);
  const planner = new IdbMigrationPlanner();
  const planResult = planner.plan({
    contract: contractJson,
    schema: fromSchema,
    policy: { allowedOperationClasses: ["additive", "widening", "destructive", "data"] },
    fromContract: fromContractJson as Contract,
    frameworkComponents: [],
    spaceId: ctx.spaceId,
  });

  if (planResult.kind === "failure") {
    process.stderr.write(
      "migration plan: migration planning failed:\n" +
        planResult.conflicts.map((c) => `  ${c.summary}`).join("\n") +
        "\n"
    );
    return 1;
  }

  const plan = planResult.plan as IdbMigrationPlanWithAuthoring;
  const ops = plan.operations;
  const fromHash = head.metadata.to;
  const toHash = plan.destination.storageHash;

  if (fromHash === toHash) {
    process.stdout.write("migration plan: contract is unchanged since the last migration — nothing to do.\n");
    return 0;
  }

  const timestamp = new Date();
  const dirName = formatMigrationDirName(timestamp, ctx.name);
  const providedInvariants = Array.from(deriveProvidedInvariants(ops));
  const baseMetadata = { from: fromHash, to: toHash, providedInvariants, createdAt: timestamp.toISOString() };
  const migrationHash = computeMigrationHash(
    baseMetadata,
    ops as unknown as Parameters<typeof computeMigrationHash>[1]
  );
  const metadata = { ...baseMetadata, migrationHash };

  await writeMigrationPackage(ctx, {
    dirName,
    ops,
    metadata,
    migrationTsContent: plan.renderTypeScript(),
    contractRaw,
    providedInvariants,
    fromLabel: fromHash,
    toHash,
    logVerb: "Generated migration",
  });

  return 0;
}

interface WritePackageInput {
  readonly dirName: string;
  readonly ops: readonly unknown[];
  readonly metadata: { readonly from: string | null; readonly to: string; readonly migrationHash: string };
  readonly migrationTsContent: string;
  readonly contractRaw: string;
  readonly providedInvariants: readonly string[];
  readonly fromLabel: string;
  readonly toHash: string;
  readonly logVerb: string;
}

async function writeMigrationPackage(ctx: SharedCtx, input: WritePackageInput): Promise<void> {
  const packageDir = join(ctx.targetDir, input.dirName);
  await mkdir(packageDir, { recursive: true });

  await writeFile(join(packageDir, "ops.json"), JSON.stringify(input.ops, null, 2), "utf-8");
  await writeFile(join(packageDir, "migration.json"), JSON.stringify(input.metadata, null, 2), "utf-8");
  await writeFile(join(packageDir, "migration.ts"), input.migrationTsContent, "utf-8");
  await writeFile(join(packageDir, "end-contract.json"), input.contractRaw, "utf-8");

  const contractDtsPath = ctx.contractPath.replace(/\.json$/i, ".d.ts");
  try {
    await copyFile(contractDtsPath, join(packageDir, "end-contract.d.ts"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    process.stderr.write(
      `Warning: contract.d.ts not found at ${contractDtsPath}.\n` +
        "The next `migration plan` will fail without it.\n" +
        "Run `prisma-next contract emit` first, then re-run this command.\n\n"
    );
  }

  let extensionSpaceNote = "";
  if (!ctx.isAppSpace) {
    const refsDir = join(ctx.migrationsDir, "refs");
    await mkdir(refsDir, { recursive: true });
    await writeFile(
      join(refsDir, "head.json"),
      JSON.stringify({ hash: input.toHash, invariants: input.providedInvariants }, null, 2),
      "utf-8"
    );
    extensionSpaceNote =
      `\nAlso pinned migrations/refs/head.json → ${input.toHash}\n` +
      "exports/control.ts already JSON-imports migrations/refs/head.json, so it will pick up the new head " +
      `automatically — just make sure it also imports the new migration package (migrations/${input.dirName}).\n`;
  }

  process.stdout.write(
    `${input.logVerb} at ${ctx.dirLabel}${input.dirName}\n` +
      `  from: ${input.fromLabel}\n` +
      `  to:   ${input.toHash}\n` +
      `  ops:  ${input.ops.length} operation${input.ops.length === 1 ? "" : "s"}\n` +
      (ctx.isAppSpace
        ? "\nNext: run `prisma-next-idb migration contract-space` to bundle into contract-space.generated.ts\n"
        : extensionSpaceNote)
  );
}

function readStorageHash(contract: unknown): string | null {
  if (typeof contract !== "object" || contract === null) return null;
  const storage = (contract as { readonly storage?: unknown }).storage;
  if (typeof storage !== "object" || storage === null) return null;
  const hash = (storage as { readonly storageHash?: unknown }).storageHash;
  return typeof hash === "string" && hash.length > 0 ? hash : null;
}
