import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { describe, expect, it, afterEach } from "vitest";
import { readManifest, writeManifest, markerToRecord, recordToMarker, emptyManifest } from "../src/core/manifest";
import type { IdbManifest } from "../src/core/manifest";

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpPath(name: string) {
  return join(tmpdir(), `prisma-idb-test-${name}-${Date.now()}.json`);
}

// ── emptyManifest ─────────────────────────────────────────────────────────────

describe("emptyManifest", () => {
  it("returns version 1 with empty stores and no marker", () => {
    const m = emptyManifest();
    expect(m.version).toBe(1);
    expect(m.schema.stores).toEqual({});
    expect(m.marker).toBeUndefined();
  });
});

// ── readManifest ──────────────────────────────────────────────────────────────

describe("readManifest", () => {
  it("returns null when file does not exist", async () => {
    const result = await readManifest(tmpPath("nonexistent"));
    expect(result).toBeNull();
  });

  it("reads back a manifest that was written by writeManifest", async () => {
    const path = tmpPath("roundtrip");
    afterEach(() => {
      try {
        rmSync(path);
      } catch {
        /* ignore */
      }
    });

    const manifest: IdbManifest = {
      version: 1,
      schema: {
        stores: {
          users: { keyPath: "id", indexes: { byEmail: { keyPath: "email", unique: true } } },
        },
      },
    };

    await writeManifest(path, manifest);
    const read = await readManifest(path);

    expect(read).toEqual(manifest);
  });

  it("throws when JSON is malformed", async () => {
    const { writeFile } = await import("node:fs/promises");
    const path = tmpPath("malformed");
    afterEach(() => {
      try {
        rmSync(path);
      } catch {
        /* ignore */
      }
    });
    await writeFile(path, "{ not valid json", "utf-8");

    await expect(readManifest(path)).rejects.toThrow();
  });

  it("throws when version is wrong", async () => {
    const { writeFile } = await import("node:fs/promises");
    const path = tmpPath("badversion");
    afterEach(() => {
      try {
        rmSync(path);
      } catch {
        /* ignore */
      }
    });
    await writeFile(path, JSON.stringify({ version: 99, schema: {} }), "utf-8");

    await expect(readManifest(path)).rejects.toThrow("invalid or has an unsupported version");
  });
});

// ── writeManifest (atomicity) ─────────────────────────────────────────────────

describe("writeManifest", () => {
  it("writes and overwrites atomically without leaving temp files", async () => {
    const { readdir } = await import("node:fs/promises");
    const path = tmpPath("atomic");
    afterEach(() => {
      try {
        rmSync(path);
      } catch {
        /* ignore */
      }
    });

    const manifest: IdbManifest = { version: 1, schema: { stores: { posts: { keyPath: "id" } } } };
    await writeManifest(path, manifest);
    await writeManifest(path, { ...manifest, schema: { stores: { posts: { keyPath: "id", autoIncrement: true } } } });

    const final = await readManifest(path);
    expect(final?.schema.stores["posts"]?.autoIncrement).toBe(true);

    // No lingering .tmp files in tmpdir.
    const files = await readdir(tmpdir());
    const tempFiles = files.filter((f) => f.includes("prisma-idb-manifest") && f.endsWith(".tmp"));
    expect(tempFiles).toHaveLength(0);
  });
});

// ── markerToRecord / recordToMarker ───────────────────────────────────────────

describe("markerToRecord / recordToMarker", () => {
  it("round-trips through both converters", () => {
    const now = new Date("2025-01-15T12:00:00.000Z");
    const marker = {
      storageHash: "sha256:abc123",
      profileHash: "sha256:def456",
      updatedAt: now.toISOString(),
      invariants: ["inv-1"],
      contractJson: null,
      canonicalVersion: null,
      appTag: null,
      meta: {},
    };

    const record = markerToRecord(marker);
    expect(record.storageHash).toBe(marker.storageHash);
    expect(record.updatedAt).toBeInstanceOf(Date);
    expect(record.updatedAt.toISOString()).toBe(now.toISOString());

    const backToMarker = recordToMarker(record);
    expect(backToMarker).toEqual(marker);
  });

  it("recordToMarker sets defaults for optional fields", () => {
    const record = {
      storageHash: "sha256:abc",
      profileHash: "sha256:xyz",
      updatedAt: new Date(),
      invariants: [],
      contractJson: null,
      canonicalVersion: null,
      appTag: null,
      meta: {},
    };

    const marker = recordToMarker(record);
    expect(marker.invariants).toEqual([]);
    expect(marker.contractJson).toBeNull();
    expect(marker.canonicalVersion).toBeNull();
    expect(marker.appTag).toBeNull();
    expect(marker.meta).toEqual({});
  });
});
