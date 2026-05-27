/**
 * Tests for the `generate-baseline` CLI command.
 *
 * Coverage:
 * - Fresh project (no migrations dir at all) → package written successfully.
 * - Empty migrations/app/ dir → package written successfully.
 * - Existing packages → refused (exit 1) with a clear message on stderr.
 * - Missing contract.json → refused (exit 1) with actionable message.
 * - Written package has the correct 4-file layout.
 * - migration.json has correct metadata (from: null, to: storageHash, migrationHash present).
 * - ops.json has IDB DDL ops (at least the marker store + user stores).
 * - migration.ts contains the class-based scaffold.
 * - end-contract.json is identical to contract.json.
 * - After generation, generate-contract-space can consume the package.
 */

import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateBaseline } from "../src/core/generate-baseline";
import { generateContractSpace } from "../src/core/contract-space-codegen";

// ── Minimal IDB contract.json for tests ─────────────────────────────────────
//
// Must have `storage.storageHash` (for the hash) and `storage.stores` (for
// the planner to generate ops). `contractToIdbSchema` reads these fields.

const MINIMAL_CONTRACT = {
  storage: {
    storageHash: "sha256:abc123testcontract",
    stores: {
      users: {
        keyPath: "id",
        indexes: {
          byEmail: { keyPath: "email", unique: true },
        },
      },
    },
  },
};

const MINIMAL_CONTRACT_JSON = JSON.stringify(MINIMAL_CONTRACT, null, 2);

// ── Test harness ─────────────────────────────────────────────────────────────

let cwd: string;
let originalStdout: typeof process.stdout.write;
let originalStderr: typeof process.stderr.write;
let capturedStderr: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "idb-generate-baseline-test-"));

  // Set up the canonical contract.json location.
  await mkdir(join(cwd, "src", "lib", "prisma"), { recursive: true });
  await writeFile(join(cwd, "src", "lib", "prisma", "contract.json"), MINIMAL_CONTRACT_JSON, "utf-8");

  // Suppress stdout and capture stderr so tests can assert on error messages.
  capturedStderr = "";
  originalStdout = process.stdout.write.bind(process.stdout);
  originalStderr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (() => true) as typeof process.stdout.write;
  process.stderr.write = ((s: string) => {
    capturedStderr += s;
    return true;
  }) as typeof process.stderr.write;
});

afterEach(() => {
  process.stdout.write = originalStdout;
  process.stderr.write = originalStderr;
});

// ── Happy-path tests ─────────────────────────────────────────────────────────

describe("generateBaseline — happy path", () => {
  it("returns 0 and creates the package directory when migrations/app does not exist", async () => {
    const code = await generateBaseline({ cwd });
    expect(code).toBe(0);

    const entries = await readdir(join(cwd, "migrations", "app"), { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    expect(dirs).toHaveLength(1);
    expect(dirs[0]!.name).toMatch(/^\d{8}T\d{4}_baseline$/);
  });

  it("returns 0 when migrations/app/ exists but is empty", async () => {
    await mkdir(join(cwd, "migrations", "app"), { recursive: true });

    const code = await generateBaseline({ cwd });
    expect(code).toBe(0);

    const entries = await readdir(join(cwd, "migrations", "app"), { withFileTypes: true });
    expect(entries.filter((e) => e.isDirectory())).toHaveLength(1);
  });

  it("creates all four required files in the package directory", async () => {
    await generateBaseline({ cwd });

    const pkgDir = await findOnlyPackageDir(cwd);
    expect(existsSync(join(pkgDir, "ops.json"))).toBe(true);
    expect(existsSync(join(pkgDir, "migration.json"))).toBe(true);
    expect(existsSync(join(pkgDir, "migration.ts"))).toBe(true);
    expect(existsSync(join(pkgDir, "end-contract.json"))).toBe(true);
  });

  it("copies contract.d.ts to end-contract.d.ts when it exists alongside contract.json", async () => {
    // Write a minimal contract.d.ts next to the contract.json the harness set up.
    const contractDtsPath = join(cwd, "src", "lib", "prisma", "contract.d.ts");
    await writeFile(contractDtsPath, "// generated contract types\nexport type StorageHash = string;\n", "utf-8");

    await generateBaseline({ cwd });

    const pkgDir = await findOnlyPackageDir(cwd);
    expect(existsSync(join(pkgDir, "end-contract.d.ts"))).toBe(true);
    const content = await readFile(join(pkgDir, "end-contract.d.ts"), "utf-8");
    expect(content).toContain("generated contract types");
  });

  it("emits a warning but still succeeds when contract.d.ts is absent", async () => {
    // No contract.d.ts in the default location — generate-baseline should warn but return 0.
    const code = await generateBaseline({ cwd });
    expect(code).toBe(0);
    expect(capturedStderr).toContain("contract.d.ts not found");

    const pkgDir = await findOnlyPackageDir(cwd);
    // end-contract.d.ts is not written, but the other 4 files are still there.
    expect(existsSync(join(pkgDir, "end-contract.d.ts"))).toBe(false);
    expect(existsSync(join(pkgDir, "end-contract.json"))).toBe(true);
  });

  it("uses a custom name slug when provided", async () => {
    await generateBaseline({ cwd, name: "init" });

    const entries = await readdir(join(cwd, "migrations", "app"), { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory());
    expect(dirs[0]!.name).toMatch(/^\d{8}T\d{4}_init$/);
  });
});

// ── migration.json tests ─────────────────────────────────────────────────────

describe("generateBaseline — migration.json", () => {
  it("has from: null (baseline sentinel)", async () => {
    await generateBaseline({ cwd });
    const meta = await readMeta(cwd);
    expect(meta.from).toBeNull();
  });

  it("has to set to the contract storageHash", async () => {
    await generateBaseline({ cwd });
    const meta = await readMeta(cwd);
    expect(meta.to).toBe(MINIMAL_CONTRACT.storage.storageHash);
  });

  it("has a non-empty migrationHash string", async () => {
    await generateBaseline({ cwd });
    const meta = await readMeta(cwd);
    expect(typeof meta.migrationHash).toBe("string");
    expect(meta.migrationHash.length).toBeGreaterThan(0);
  });

  it("has required metadata fields (hints, labels, createdAt)", async () => {
    await generateBaseline({ cwd });
    const meta = await readMeta(cwd);
    expect(meta.hints).toBeDefined();
    expect(meta.hints.plannerVersion).toBe("2.0.0");
    expect(Array.isArray(meta.labels)).toBe(true);
    expect(typeof meta.createdAt).toBe("string");
  });
});

// ── ops.json tests ───────────────────────────────────────────────────────────

describe("generateBaseline — ops.json", () => {
  it("is a non-empty JSON array", async () => {
    await generateBaseline({ cwd });
    const ops = await readOps(cwd);
    expect(Array.isArray(ops)).toBe(true);
    expect(ops.length).toBeGreaterThan(0);
  });

  it("contains at least one createObjectStore op for _prisma_next_marker", async () => {
    await generateBaseline({ cwd });
    const ops = await readOps(cwd);
    const markerOp = ops.find((op) => op.kind === "createObjectStore" && op.storeName === "_prisma_next_marker");
    expect(markerOp).toBeDefined();
  });

  it("contains a createObjectStore op for each user model in the contract", async () => {
    await generateBaseline({ cwd });
    const ops = await readOps(cwd);
    const usersOp = ops.find((op) => op.kind === "createObjectStore" && op.storeName === "users");
    expect(usersOp).toBeDefined();
  });

  it("contains a createIndex op for each declared index", async () => {
    await generateBaseline({ cwd });
    const ops = await readOps(cwd);
    const indexOp = ops.find(
      (op) => op.kind === "createIndex" && op.storeName === "users" && op.indexName === "byEmail"
    );
    expect(indexOp).toBeDefined();
    expect(indexOp?.def).toMatchObject({ unique: true });
  });

  it("each op has id, label, operationClass (MigrationPlanOperation shape)", async () => {
    await generateBaseline({ cwd });
    const ops = await readOps(cwd);
    for (const op of ops) {
      expect(typeof op.id).toBe("string");
      expect(typeof op.label).toBe("string");
      expect(["additive", "widening", "destructive", "data"]).toContain(op.operationClass);
    }
  });
});

// ── migration.ts tests ───────────────────────────────────────────────────────

describe("generateBaseline — migration.ts", () => {
  it("contains the class-based scaffold pattern", async () => {
    await generateBaseline({ cwd });
    const ts = await readMigrationTs(cwd);
    expect(ts).toContain("class M extends Migration");
    expect(ts).toContain("MigrationCLI.run(import.meta.url, M)");
  });

  it("declares from: null in describe()", async () => {
    await generateBaseline({ cwd });
    const ts = await readMigrationTs(cwd);
    expect(ts).toContain("from: null");
  });

  it("imports from @prisma-next-idb/target-idb/migration", async () => {
    await generateBaseline({ cwd });
    const ts = await readMigrationTs(cwd);
    expect(ts).toContain('"@prisma-next-idb/target-idb/migration"');
  });

  it("includes createObjectStoreOp calls for the contract stores", async () => {
    await generateBaseline({ cwd });
    const ts = await readMigrationTs(cwd);
    expect(ts).toContain('createObjectStoreOp("users"');
  });
});

// ── end-contract.json tests ──────────────────────────────────────────────────

describe("generateBaseline — end-contract.json", () => {
  it("is identical to the source contract.json bytes", async () => {
    await generateBaseline({ cwd });
    const pkgDir = await findOnlyPackageDir(cwd);
    const endContract = await readFile(join(pkgDir, "end-contract.json"), "utf-8");
    expect(endContract).toBe(MINIMAL_CONTRACT_JSON);
  });
});

// ── Error-path tests ─────────────────────────────────────────────────────────

describe("generateBaseline — error cases", () => {
  it("returns 1 and writes to stderr when migrations/app/ already has packages", async () => {
    // Simulate an existing baseline package.
    const existingPkg = join(cwd, "migrations", "app", "20260101T0000_baseline");
    await mkdir(existingPkg, { recursive: true });
    await writeFile(join(existingPkg, "migration.json"), JSON.stringify({ from: null, to: "sha256:x" }), "utf-8");

    const code = await generateBaseline({ cwd });
    expect(code).toBe(1);
    expect(capturedStderr).toContain("already contains");
    expect(capturedStderr).toContain("prisma-next migration plan");
  });

  it("returns 1 when contract.json is missing", async () => {
    // Remove the contract.json we set up in beforeEach.
    const { unlink } = await import("node:fs/promises");
    await unlink(join(cwd, "src", "lib", "prisma", "contract.json"));

    const code = await generateBaseline({ cwd });
    expect(code).toBe(1);
    expect(capturedStderr).toContain("contract.json not found");
    expect(capturedStderr).toContain("contract emit");
  });

  it("uses custom contractPath when provided", async () => {
    const customPath = join(cwd, "custom-contract.json");
    await writeFile(customPath, MINIMAL_CONTRACT_JSON, "utf-8");

    const code = await generateBaseline({ cwd, contractPath: customPath });
    expect(code).toBe(0);
  });

  it("uses custom migrationsDir when provided", async () => {
    const customMigsDir = join(cwd, "db-migrations");
    const code = await generateBaseline({ cwd, migrationsDir: customMigsDir });
    expect(code).toBe(0);

    const appDir = join(customMigsDir, "app");
    const entries = await readdir(appDir, { withFileTypes: true });
    expect(entries.filter((e) => e.isDirectory())).toHaveLength(1);
  });
});

// ── Integration: generate-baseline → generate-contract-space ─────────────────

describe("generateBaseline → generateContractSpace integration", () => {
  it("the package produced by generate-baseline is consumable by generate-contract-space", async () => {
    await mkdir(join(cwd, "src", "lib", "prisma"), { recursive: true });

    const baselineCode = await generateBaseline({ cwd });
    expect(baselineCode).toBe(0);

    const spaceCode = await generateContractSpace({ cwd });
    expect(spaceCode).toBe(0);

    const generated = await readFile(join(cwd, "src", "lib", "prisma", "contract-space.generated.ts"), "utf-8");
    expect(generated).toContain("_baseline");
    expect(generated).toContain("contractSpaceFromJson");
    // headRef should reference the last package's `to` (our contract hash).
    expect(generated).toContain("_meta.to");
  });

  it("generate-contract-space chain validates correctly (from null is the baseline)", async () => {
    await generateBaseline({ cwd });

    // Should not throw — the chain has exactly one package with from: null.
    await expect(generateContractSpace({ cwd })).resolves.toBe(0);
  });
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Typed shape of the migration.json we read back from disk. */
interface ParsedMetadata {
  from: string | null;
  to: string;
  migrationHash: string;
  hints: { plannerVersion: string; used: string[]; applied: string[] };
  labels: string[];
  createdAt: string;
  providedInvariants: string[];
}

/** Typed shape of each element in the ops.json array. */
interface ParsedOp {
  kind: string;
  storeName?: string;
  indexName?: string;
  def?: Record<string, unknown>;
  id: string;
  label: string;
  operationClass: string;
}

async function findOnlyPackageDir(cwd: string): Promise<string> {
  const appDir = join(cwd, "migrations", "app");
  const entries = await readdir(appDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length !== 1) throw new Error(`Expected exactly 1 package dir, got ${dirs.length}`);
  return join(appDir, dirs[0]!.name);
}

async function readMeta(cwd: string): Promise<ParsedMetadata> {
  const pkgDir = await findOnlyPackageDir(cwd);
  return JSON.parse(await readFile(join(pkgDir, "migration.json"), "utf-8")) as ParsedMetadata;
}

async function readOps(cwd: string): Promise<ParsedOp[]> {
  const pkgDir = await findOnlyPackageDir(cwd);
  return JSON.parse(await readFile(join(pkgDir, "ops.json"), "utf-8")) as ParsedOp[];
}

async function readMigrationTs(cwd: string): Promise<string> {
  const pkgDir = await findOnlyPackageDir(cwd);
  return readFile(join(pkgDir, "migration.ts"), "utf-8");
}
