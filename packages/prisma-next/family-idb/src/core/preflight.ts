import { readdir, readFile } from "node:fs/promises";
import { IDBFactory } from "fake-indexeddb";
import type { MigrationMetadata } from "@prisma-next/migration-tools/metadata";
import { chainOrderByMetadata, type ChainablePackage } from "./chain-order";
import { applyOneDdlOp, isIdbDdlOp, type IdbDdlOp } from "@prisma-next-idb/target-idb/migration";
import { join } from "pathe";

export interface PreflightOptions {
  readonly cwd: string;
  readonly migrationsDir?: string;
}

/**
 * Walk every migration package under `<migrationsDir>/app/` in chain order,
 * applying each package's `ops.json` against a fresh `fake-indexeddb`
 * instance inside an `upgradeneeded` callback. Reports per-step status to
 * stdout and the final outcome via exit code.
 *
 * **Why this exists**: prior to Phase 7, the runner did this validation on
 * every `db update` invocation — see `FEEDBACKS.md` §7. That had three
 * problems: (a) it validated against the wrong oracle (`fake-indexeddb`
 * disagrees with real browsers on edge cases); (b) it substituted a
 * runtime check for missing test coverage; (c) it shipped a test-only
 * package on a production path. Pulling the walk out into its own command
 * gives CI the gate without paying the workflow tax on every author.
 *
 * **Scope vs runtime**: this command catches "the chain doesn't apply
 * cleanly" — a structural issue. It does NOT catch "the chain produces
 * the wrong schema" (that's `verifySchema` against the head's
 * `end-contract.json`, deferred to a follow-up).
 *
 * Exit codes: 0 on full chain success; 1 on any failure.
 */
export async function runPreflight(opts: PreflightOptions): Promise<number> {
  const migrationsDir = opts.migrationsDir ?? join(opts.cwd, "migrations");
  const appDir = join(migrationsDir, "app");

  const packages = await loadPackages(appDir);
  if (packages.length === 0) {
    process.stdout.write("No migration packages found. Nothing to preflight.\n");
    return 0;
  }

  process.stdout.write(`Preflighting ${packages.length} migration(s) against fake-indexeddb…\n`);

  const factory = new IDBFactory();
  const dbName = "__preflight__";

  let currentVersion = 0;
  for (const pkg of packages) {
    process.stdout.write(`  ${pkg.dirName} … `);
    try {
      currentVersion += 1;
      await applyPackage({ factory, dbName, targetVersion: currentVersion, ops: pkg.ops });
      process.stdout.write("ok\n");
    } catch (err) {
      process.stdout.write("FAILED\n");
      process.stderr.write(`    ${err instanceof Error ? err.message : String(err)}\n`);
      process.stderr.write("\nPreflight failed.\n");
      return 1;
    }
  }

  process.stdout.write("\nPreflight passed: every migration in the chain applies cleanly.\n");
  return 0;
}

interface LoadedPackage extends ChainablePackage {
  readonly metadata: MigrationMetadata;
  readonly ops: readonly IdbDdlOp[];
}

async function loadPackages(appDir: string): Promise<LoadedPackage[]> {
  let dirs: string[];
  try {
    dirs = (await readdir(appDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }

  // Load all packages unordered, then derive chain order by walking
  // metadata.from/to edges. Directory name sort is unreliable when
  // timestamp formats mix between hand-authored baselines and CLI-emitted
  // additions (e.g. T120000 vs T0337).
  const unordered = new Map<string, LoadedPackage>();
  for (const dirName of dirs) {
    const metaRaw = await readFile(join(appDir, dirName, "migration.json"), "utf-8");
    const opsRaw = await readFile(join(appDir, dirName, "ops.json"), "utf-8");
    const metadata = JSON.parse(metaRaw) as MigrationMetadata;
    const opsParsed = JSON.parse(opsRaw) as unknown[];
    const ops: IdbDdlOp[] = [];
    for (const op of opsParsed) {
      if (!isIdbDdlOp(op as never)) {
        throw new Error(`Non-IDB op found in ${dirName}/ops.json: ${JSON.stringify(op)}`);
      }
      ops.push(op as IdbDdlOp);
    }
    unordered.set(dirName, { dirName, metadata, ops });
  }

  return chainOrderByMetadata(unordered);
}

function applyPackage(input: {
  readonly factory: IDBFactory;
  readonly dbName: string;
  readonly targetVersion: number;
  readonly ops: readonly IdbDdlOp[];
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = input.factory.open(input.dbName, input.targetVersion);
    req.onupgradeneeded = (event) => {
      const target = event.target as IDBOpenDBRequest;
      const db = target.result;
      const tx = target.transaction;
      if (tx === null) {
        reject(new Error("upgradeneeded fired with null version-change transaction"));
        return;
      }
      try {
        for (const op of input.ops) {
          applyOneDdlOp(db, tx, op);
        }
      } catch (err) {
        reject(err);
      }
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error ?? new Error("preflight open request failed"));
  });
}
