/**
 * Tests for the `generate-migration` CLI command's `spaceId` option
 * (extension-space incremental migrations, ADR 212).
 *
 * App-space behavior (the default) is already covered end-to-end by
 * `smoke-workflow.test.ts`. These tests focus specifically on what changes
 * for a non-`"app"` spaceId: on-disk layout and the migrations/refs/head.json
 * update that generate-baseline.test.ts doesn't need to cover (a baseline
 * writes head.json once; an incremental migration must rewrite it).
 */

import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateBaseline } from "../src/core/generate-baseline";
import { generateMigration } from "../src/core/generate-migration";

const CONTRACT_V1 = {
  storage: {
    storageHash: "sha256:contractv1",
    stores: {
      outboxEvent: { keyPath: "id" },
    },
  },
};

const CONTRACT_V2 = {
  storage: {
    storageHash: "sha256:contractv2",
    stores: {
      outboxEvent: { keyPath: "id" },
      versionMeta: { keyPath: "id" },
    },
  },
};

let cwd: string;
let capturedStderr: string;
let originalStdout: typeof process.stdout.write;
let originalStderr: typeof process.stderr.write;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "idb-generate-migration-test-"));
  await mkdir(join(cwd, "src", "lib", "prisma"), { recursive: true });
  await writeFile(join(cwd, "src", "lib", "prisma", "contract.json"), JSON.stringify(CONTRACT_V1, null, 2), "utf-8");

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

async function bumpToV2(): Promise<void> {
  await writeFile(join(cwd, "src", "lib", "prisma", "contract.json"), JSON.stringify(CONTRACT_V2, null, 2), "utf-8");
}

describe("generateMigration — spaceId (extension-space mode)", () => {
  it("writes the incremental package directly under migrationsDir, not migrations/app/", async () => {
    expect(await generateBaseline({ cwd, spaceId: "idb-sync" })).toBe(0);
    await bumpToV2();
    expect(await generateMigration({ cwd, name: "add_version_meta", spaceId: "idb-sync" })).toBe(0);

    const entries = await readdir(join(cwd, "migrations"), { withFileTypes: true });
    const dirs = entries.filter((e) => e.isDirectory() && e.name !== "refs").map((e) => e.name);
    expect(dirs).toHaveLength(2);
    expect(dirs.some((d) => d.endsWith("_add_version_meta"))).toBe(true);
    expect(existsSync(join(cwd, "migrations", "app"))).toBe(false);
  });

  it("updates migrations/refs/head.json to the new head after an incremental migration", async () => {
    expect(await generateBaseline({ cwd, spaceId: "idb-sync" })).toBe(0);
    const headAfterBaseline = JSON.parse(await readFile(join(cwd, "migrations", "refs", "head.json"), "utf-8")) as {
      hash: string;
    };
    expect(headAfterBaseline.hash).toBe(CONTRACT_V1.storage.storageHash);

    await bumpToV2();
    expect(await generateMigration({ cwd, name: "add_version_meta", spaceId: "idb-sync" })).toBe(0);

    const headAfterMigration = JSON.parse(await readFile(join(cwd, "migrations", "refs", "head.json"), "utf-8")) as {
      hash: string;
      invariants: string[];
    };
    expect(headAfterMigration.hash).toBe(CONTRACT_V2.storage.storageHash);
    expect(Array.isArray(headAfterMigration.invariants)).toBe(true);
  });

  it("the new migration's ops only cover the delta (new store), not the whole contract", async () => {
    expect(await generateBaseline({ cwd, spaceId: "idb-sync" })).toBe(0);
    await bumpToV2();
    expect(await generateMigration({ cwd, name: "add_version_meta", spaceId: "idb-sync" })).toBe(0);

    const entries = await readdir(join(cwd, "migrations"), { withFileTypes: true });
    const newDir = entries.find((e) => e.isDirectory() && e.name.endsWith("_add_version_meta"))!.name;
    const ops = JSON.parse(await readFile(join(cwd, "migrations", newDir, "ops.json"), "utf-8")) as Array<{
      kind: string;
      storeName?: string;
    }>;
    expect(ops.some((op) => op.kind === "createObjectStore" && op.storeName === "versionMeta")).toBe(true);
    expect(ops.some((op) => op.storeName === "outboxEvent")).toBe(false);
    // No _prisma_next_marker op — fromContract is non-null on the incremental
    // path, so the planner never prepends it (only generate-baseline's
    // fromContract: null path needs the stripping logic).
    expect(ops.some((op) => op.storeName === "_prisma_next_marker")).toBe(false);
  });

  it("app-space mode does not touch refs/head.json", async () => {
    expect(await generateBaseline({ cwd })).toBe(0); // default spaceId: "app"
    await bumpToV2();
    expect(await generateMigration({ cwd, name: "add_version_meta" })).toBe(0);
    expect(existsSync(join(cwd, "migrations", "refs", "head.json"))).toBe(false);
  });

  it("app-space and extension-space incremental migrations can coexist under the same migrationsDir", async () => {
    expect(await generateBaseline({ cwd })).toBe(0);
    expect(await generateBaseline({ cwd, spaceId: "idb-sync" })).toBe(0);
    await bumpToV2();
    expect(await generateMigration({ cwd, name: "add_todo" })).toBe(0);
    expect(await generateMigration({ cwd, name: "add_version_meta", spaceId: "idb-sync" })).toBe(0);

    const appEntries = await readdir(join(cwd, "migrations", "app"), { withFileTypes: true });
    expect(appEntries.filter((e) => e.isDirectory())).toHaveLength(2);

    const rootEntries = await readdir(join(cwd, "migrations"), { withFileTypes: true });
    const extDirs = rootEntries.filter((e) => e.isDirectory() && e.name !== "app" && e.name !== "refs");
    expect(extDirs).toHaveLength(2);
  });

  it("still refuses when the head package is internally inconsistent, in extension-space mode", async () => {
    expect(await generateBaseline({ cwd, spaceId: "idb-sync" })).toBe(0);

    const entries = await readdir(join(cwd, "migrations"), { withFileTypes: true });
    const baselineDir = entries.find((e) => e.isDirectory() && e.name !== "refs")!.name;
    const metaPath = join(cwd, "migrations", baselineDir, "migration.json");
    const meta = JSON.parse(await readFile(metaPath, "utf-8")) as Record<string, unknown>;
    await writeFile(metaPath, JSON.stringify({ ...meta, to: "sha256:wrong-head-hash" }, null, 2), "utf-8");

    await bumpToV2();
    expect(await generateMigration({ cwd, name: "add_version_meta", spaceId: "idb-sync" })).toBe(1);
    expect(capturedStderr).toContain("inconsistent");
  });
});
