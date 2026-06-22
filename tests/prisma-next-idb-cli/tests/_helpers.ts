/**
 * Shared helpers for the prisma-next-idb CLI regression tests.
 *
 * - `cli(args, opts)` — spawn the built `prisma-next-idb` binary in a
 *   given cwd, return `{ stdout, stderr, exitCode }`. Never throws on
 *   non-zero exit; tests assert on the returned code.
 * - `writePackage({ cwd, dirName, from, to, ops })` — write a complete
 *   migration package (migration.json + ops.json) into
 *   `<cwd>/migrations/app/<dirName>/`.
 * - `writeContractJson(cwd, storageHash)` — write a minimal
 *   `src/lib/prisma/contract.json` with the given hash.
 * - `writeRawContractJson(cwd, contract)` — write an arbitrary object as
 *   `src/lib/prisma/contract.json`; used when commands need a full contract
 *   (e.g. generate-baseline, which calls the migration planner).
 * - `getMigrationDirs(cwd)` — return sorted directory names under
 *   `<cwd>/migrations/app/`.
 * - `setupTmpProject()` — mkdtemp + minimal directory scaffolding;
 *   returns the project cwd.
 */

import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

/**
 * Absolute path to the built CLI binary in the family-idb workspace.
 * Tests must run AFTER `pnpm -F @prisma-next-idb/family-idb build`.
 */
export const CLI_BIN = resolve(__dirname, "../../../packages/prisma-next/family-idb/dist/bin/prisma-next-idb.mjs");

export interface CliResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export async function cli(args: readonly string[], opts: { cwd: string }): Promise<CliResult> {
  const result = await execa("node", [CLI_BIN, ...args], {
    cwd: opts.cwd,
    reject: false,
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.exitCode ?? 0,
  };
}

export async function setupTmpProject(label: string): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), `idb-cli-test-${label}-`));
  await mkdir(join(cwd, "migrations", "app"), { recursive: true });
  await mkdir(join(cwd, "src", "lib", "prisma"), { recursive: true });
  return cwd;
}

export async function writeContractJson(cwd: string, storageHash: string): Promise<void> {
  await writeFile(
    join(cwd, "src", "lib", "prisma", "contract.json"),
    JSON.stringify({ storage: { storageHash } }, null, 2),
    "utf-8"
  );
}

export async function writeRawContractJson(cwd: string, contract: unknown): Promise<void> {
  await writeFile(join(cwd, "src", "lib", "prisma", "contract.json"), JSON.stringify(contract, null, 2), "utf-8");
}

export async function getMigrationDirs(cwd: string): Promise<string[]> {
  const appDir = join(cwd, "migrations", "app");
  const entries = await readdir(appDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

export interface PackageInput {
  readonly cwd: string;
  readonly dirName: string;
  readonly from: string | null;
  readonly to: string;
  readonly migrationHash?: string;
  readonly providedInvariants?: readonly string[];
  readonly ops: readonly unknown[];
}

export async function writePackage(p: PackageInput): Promise<void> {
  const dir = join(p.cwd, "migrations", "app", p.dirName);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "migration.json"),
    JSON.stringify(
      {
        from: p.from,
        to: p.to,
        migrationHash: p.migrationHash ?? `sha256:hash-${p.dirName}`,
        providedInvariants: p.providedInvariants ?? [],
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      null,
      2
    ),
    "utf-8"
  );
  await writeFile(join(dir, "ops.json"), JSON.stringify(p.ops, null, 2), "utf-8");
}

// ── Canonical op fixtures (match the schema the runtime expects) ─────────────

export const createMarkerStoreOp = {
  kind: "createObjectStore",
  id: "object-store._prisma_next_marker.create",
  label: 'Create internal marker store "_prisma_next_marker"',
  operationClass: "additive",
  storeName: "_prisma_next_marker",
  def: { keyPath: "space" },
} as const;

export const createUsersStoreOp = {
  kind: "createObjectStore",
  id: "object-store.users.create",
  label: 'Create object store "users"',
  operationClass: "additive",
  storeName: "users",
  def: { keyPath: "id" },
} as const;

export const createPostsStoreOp = {
  kind: "createObjectStore",
  id: "object-store.posts.create",
  label: 'Create object store "posts"',
  operationClass: "additive",
  storeName: "posts",
  def: { keyPath: "id" },
} as const;

export const createCommentsStoreOp = {
  kind: "createObjectStore",
  id: "object-store.comments.create",
  label: 'Create object store "comments"',
  operationClass: "additive",
  storeName: "comments",
  def: { keyPath: "id" },
} as const;

export const createPostsByAuthorIdIndexOp = {
  kind: "createIndex",
  id: "index.posts.byAuthorId.create",
  label: 'Create index "byAuthorId" on "posts"',
  operationClass: "additive",
  storeName: "posts",
  indexName: "byAuthorId",
  def: { keyPath: "authorId", unique: false },
} as const;

/**
 * A genuinely-broken op: create an index on a store that was never created.
 * The apply path calls `tx.objectStore("does-not-exist")`, which throws
 * NotFoundError. (Dropping a non-existent store is NOT a failure — the DDL
 * apply path is idempotent for crash-recovery replay; see ADR 002 / Issue #25.)
 */
export const indexOnMissingStoreOp = {
  kind: "createIndex",
  id: "index.does-not-exist.byThing.create",
  label: 'Create index "byThing" on "does-not-exist"',
  operationClass: "additive",
  storeName: "does-not-exist",
  indexName: "byThing",
  def: { keyPath: "thing", unique: false },
} as const;
