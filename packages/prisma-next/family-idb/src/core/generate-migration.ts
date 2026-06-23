import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import type { Contract } from "@prisma-next/contract/types";
import type { IdbMigrationPlanWithAuthoring } from "@prisma-next-idb/target-idb/migration";
import { IdbMigrationPlanner, contractToIdbSchema } from "@prisma-next-idb/target-idb/migration";
import { computeMigrationHash } from "@prisma-next/migration-tools/hash";
import { formatMigrationDirName } from "@prisma-next/migration-tools/io";
import { deriveProvidedInvariants } from "@prisma-next/migration-tools/invariants";
import { join } from "pathe";
import { chainOrderByMetadata } from "./chain-order";

export interface GenerateMigrationOptions {
  readonly cwd: string;
  readonly migrationsDir?: string;
  readonly contractPath?: string;
  /** Slug appended to the timestamped directory name. */
  readonly name: string;
}

/**
 * Generate the next incremental migration package for an IDB project that
 * already has a baseline migration.
 *
 * Reads the head migration's `end-contract.json` as the from-state, diffs it
 * against the current `contract.json`, and writes the new package with the
 * correct `from` storage-hash so the chain remains linear.
 */
export async function generateMigration(opts: GenerateMigrationOptions): Promise<number> {
  const migrationsDir = opts.migrationsDir ?? join(opts.cwd, "migrations");
  const appDir = join(migrationsDir, "app");
  const contractPath = opts.contractPath ?? join(opts.cwd, "src/lib/prisma/contract.json");

  // ── 1. Load and chain-order all existing migration packages ──────────────────

  let dirNames: string[];
  try {
    const entries = await readdir(appDir, { withFileTypes: true });
    dirNames = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      process.stderr.write(
        "generate-migration: no migrations found at migrations/app/.\n" +
          "Run `prisma-next-idb generate-baseline` first to create the initial migration.\n"
      );
      return 1;
    }
    throw err;
  }

  if (dirNames.length === 0) {
    process.stderr.write(
      "generate-migration: migrations/app/ is empty.\n" +
        "Run `prisma-next-idb generate-baseline` first to create the initial migration.\n"
    );
    return 1;
  }

  // Read migration.json for each package so chainOrderByMetadata can order them.
  const packages = new Map<string, { dirName: string; metadata: { from: string | null; to: string } }>();
  for (const dirName of dirNames) {
    const metaPath = join(appDir, dirName, "migration.json");
    let metaRaw: string;
    try {
      metaRaw = await readFile(metaPath, "utf-8");
    } catch {
      process.stderr.write(`generate-migration: cannot read ${metaPath} — skipping ${dirName}.\n`);
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
      `generate-migration: migration chain is broken — ${err instanceof Error ? err.message : String(err)}\n`
    );
    return 1;
  }

  const head = ordered[ordered.length - 1];
  if (head === undefined) {
    process.stderr.write("generate-migration: no valid migration packages could be read.\n");
    return 1;
  }

  // ── 2. Read the head migration's end-contract.json as fromContract ────────────

  const headEndContractPath = join(appDir, head.dirName, "end-contract.json");
  let fromContractRaw: string;
  let fromContractJson: unknown;
  try {
    fromContractRaw = await readFile(headEndContractPath, "utf-8");
    fromContractJson = JSON.parse(fromContractRaw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      process.stderr.write(
        `generate-migration: end-contract.json not found in head migration ${head.dirName}.\n` +
          "Re-emit the head migration with `node migration.ts` or re-run generate-baseline.\n"
      );
      return 1;
    }
    throw err;
  }

  const headEndStorageHash = readStorageHash(fromContractJson);
  if (headEndStorageHash === null) {
    process.stderr.write(
      `generate-migration: head migration ${head.dirName}/end-contract.json is missing storage.storageHash.\n` +
        "Re-emit the head migration before generating the next package.\n"
    );
    return 1;
  }

  if (head.metadata.to !== headEndStorageHash) {
    process.stderr.write(
      `generate-migration: head migration ${head.dirName} is inconsistent.\n` +
        `  migration.json to:        ${head.metadata.to}\n` +
        `  end-contract storageHash: ${headEndStorageHash}\n` +
        "Re-emit or repair the head migration before generating the next package.\n"
    );
    return 1;
  }

  // ── 3. Read the current contract.json as the destination ─────────────────────

  let contractRaw: string;
  let contractJson: unknown;
  try {
    contractRaw = await readFile(contractPath, "utf-8");
    contractJson = JSON.parse(contractRaw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      process.stderr.write(
        `generate-migration: contract.json not found at ${contractPath}.\n` +
          "Run `prisma-next contract emit` first to generate the contract file.\n"
      );
      return 1;
    }
    throw err;
  }

  // ── 4. Plan the migration from head end-state → current contract ──────────────

  const fromSchema = contractToIdbSchema(fromContractJson);
  const planner = new IdbMigrationPlanner();
  const planResult = planner.plan({
    contract: contractJson,
    schema: fromSchema,
    policy: { allowedOperationClasses: ["additive", "widening", "destructive", "data"] },
    fromContract: fromContractJson as Contract,
    frameworkComponents: [],
    spaceId: "app",
  });

  if (planResult.kind === "failure") {
    process.stderr.write(
      "generate-migration: migration planning failed:\n" +
        planResult.conflicts.map((c) => `  ${c.summary}`).join("\n") +
        "\n"
    );
    return 1;
  }

  const plan = planResult.plan as IdbMigrationPlanWithAuthoring;
  const ops = plan.operations;
  const fromHash = head.metadata.to; // storageHash of the head end-state
  const toHash = plan.destination.storageHash;

  if (fromHash === toHash) {
    process.stdout.write("generate-migration: contract is unchanged since the last migration — nothing to do.\n");
    return 0;
  }

  // ── 5. Build content-addressed migration metadata ─────────────────────────────

  const timestamp = new Date();
  const dirName = formatMigrationDirName(timestamp, opts.name);
  const packageDir = join(appDir, dirName);

  const baseMetadata = {
    from: fromHash,
    to: toHash,
    providedInvariants: Array.from(deriveProvidedInvariants(ops)),
    createdAt: timestamp.toISOString(),
  };
  const migrationHash = computeMigrationHash(
    baseMetadata,
    ops as unknown as Parameters<typeof computeMigrationHash>[1]
  );
  const metadata = { ...baseMetadata, migrationHash };

  // ── 6. Write the package to disk ──────────────────────────────────────────────

  await mkdir(packageDir, { recursive: true });

  await writeFile(join(packageDir, "ops.json"), JSON.stringify(ops, null, 2), "utf-8");
  await writeFile(join(packageDir, "migration.json"), JSON.stringify(metadata, null, 2), "utf-8");
  await writeFile(join(packageDir, "migration.ts"), plan.renderTypeScript(), "utf-8");
  await writeFile(join(packageDir, "end-contract.json"), contractRaw, "utf-8");

  const contractDtsPath = contractPath.replace(/\.json$/i, ".d.ts");
  try {
    await copyFile(contractDtsPath, join(packageDir, "end-contract.d.ts"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    process.stderr.write(
      `Warning: contract.d.ts not found at ${contractDtsPath}.\n` +
        "The next migration plan will fail without it.\n" +
        "Run `prisma-next contract emit` first, then re-run generate-migration.\n\n"
    );
  }

  process.stdout.write(
    `Generated migration at migrations/app/${dirName}\n` +
      `  from: ${fromHash}\n` +
      `  to:   ${toHash}\n` +
      `  ops:  ${ops.length} operation${ops.length === 1 ? "" : "s"}\n` +
      `\nNext: run \`prisma-next-idb generate-contract-space\` to bundle into contract-space.generated.ts\n`
  );

  return 0;
}

function readStorageHash(contract: unknown): string | null {
  if (typeof contract !== "object" || contract === null) return null;
  const storage = (contract as { readonly storage?: unknown }).storage;
  if (typeof storage !== "object" || storage === null) return null;
  const hash = (storage as { readonly storageHash?: unknown }).storageHash;
  return typeof hash === "string" && hash.length > 0 ? hash : null;
}
