import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import { describe, expect, it, afterEach } from "vitest";
import { createContract } from "@prisma-next/contract/testing";
import type { IdbStorage } from "@prisma-next-idb/target-idb/pack";
import {
  IdbManifestControlDriverDescriptor,
  extractManifestDriver,
  IdbManifestControlDriver,
} from "../src/core/manifest-driver";
import { createIdbFamilyInstance } from "../src/core/control-instance";

// ── Helpers ───────────────────────────────────────────────────────────────────

function tmpPath(name: string) {
  return join(tmpdir(), `pidb-control-test-${name}-${Date.now()}.json`);
}

/** Build a raw contract object with the given IDB stores. */
function rawContract(
  stores: Record<
    string,
    { keyPath: string; autoIncrement?: boolean; indexes?: Record<string, { keyPath: string; unique: boolean }> }
  >
) {
  return createContract<IdbStorage>({
    target: "idb",
    targetFamily: "idb",
    storage: { stores },
    models: {},
  });
}

// ── IdbManifestControlDriverDescriptor.create ─────────────────────────────────

describe("IdbManifestControlDriverDescriptor", () => {
  it("creates an IdbManifestControlDriver", async () => {
    const driver = await IdbManifestControlDriverDescriptor.create("/tmp/test.json");
    expect(driver).toBeInstanceOf(IdbManifestControlDriver);
    expect(driver.familyId).toBe("idb");
    expect(driver.targetId).toBe("idb");
    expect(driver.manifestPath).toBe("/tmp/test.json");
  });

  it("query() returns empty rows (no-op)", async () => {
    const driver = await IdbManifestControlDriverDescriptor.create("/tmp/test.json");
    const result = await driver.query("SELECT 1");
    expect(result.rows).toHaveLength(0);
  });

  it("close() resolves without error", async () => {
    const driver = await IdbManifestControlDriverDescriptor.create("/tmp/test.json");
    await expect(driver.close()).resolves.toBeUndefined();
  });
});

// ── extractManifestDriver ─────────────────────────────────────────────────────

describe("extractManifestDriver", () => {
  it("returns the driver unchanged when it is an IdbManifestControlDriver", async () => {
    const driver = await IdbManifestControlDriverDescriptor.create("/tmp/test.json");
    const extracted = extractManifestDriver(driver);
    expect(extracted).toBe(driver);
  });

  it("throws when given a non-IdbManifestControlDriver", () => {
    const bogus = {
      familyId: "idb",
      targetId: "idb",
      async query() {
        return { rows: [] };
      },
      async close() {
        /* no-op */
      },
    };

    expect(() => extractManifestDriver(bogus as never)).toThrow("IdbManifestControlDriver");
  });
});

// ── control-instance: sign + verify + readMarker + introspect ─────────────────

describe("createIdbFamilyInstance — full integration", () => {
  const instance = createIdbFamilyInstance({} as never);

  it("validateContract accepts a valid IDB contract", () => {
    const contract = rawContract({ users: { keyPath: "id" } });
    expect(() => instance.validateContract(contract)).not.toThrow();
  });

  it("sign creates a manifest marker on first run", async () => {
    const path = tmpPath("sign-create");
    afterEach(() => {
      try {
        rmSync(path);
      } catch {
        /* ignore */
      }
    });

    const driver = await IdbManifestControlDriverDescriptor.create(path);
    const contract = rawContract({ users: { keyPath: "id" } });

    const result = await instance.sign({
      driver,
      contract,
      contractPath: "/path/to/contract.json",
    });

    expect(result.ok).toBe(true);
    expect(result.marker.created).toBe(true);
    expect(result.marker.updated).toBe(false);
    expect(result.marker.previous).toBeUndefined();
  });

  it("sign is a no-op when hashes already match", async () => {
    const path = tmpPath("sign-noop");
    afterEach(() => {
      try {
        rmSync(path);
      } catch {
        /* ignore */
      }
    });

    const driver = await IdbManifestControlDriverDescriptor.create(path);
    const contract = rawContract({ users: { keyPath: "id" } });

    await instance.sign({ driver, contract, contractPath: "/contract.json" });
    const second = await instance.sign({ driver, contract, contractPath: "/contract.json" });

    expect(second.marker.created).toBe(false);
    expect(second.marker.updated).toBe(false);
  });

  it("sign updates marker when contract changes", async () => {
    const path = tmpPath("sign-update");
    afterEach(() => {
      try {
        rmSync(path);
      } catch {
        /* ignore */
      }
    });

    const driver = await IdbManifestControlDriverDescriptor.create(path);
    const contract1 = rawContract({ users: { keyPath: "id" } });
    const contract2 = rawContract({ users: { keyPath: "id" }, posts: { keyPath: "id" } });

    const first = await instance.sign({ driver, contract: contract1, contractPath: "/contract.json" });
    const second = await instance.sign({ driver, contract: contract2, contractPath: "/contract.json" });

    expect(first.marker.created).toBe(true);
    expect(second.marker.updated).toBe(true);
    expect(second.marker.previous?.storageHash).toBe(first.contract.storageHash);
  });

  it("readMarker returns null when manifest has no marker", async () => {
    const path = tmpPath("readmarker-empty");
    // Don't create the file — fresh project.
    const driver = await IdbManifestControlDriverDescriptor.create(path);
    const marker = await instance.readMarker({ driver });
    expect(marker).toBeNull();
  });

  it("readMarker returns ContractMarkerRecord after sign", async () => {
    const path = tmpPath("readmarker-after-sign");
    afterEach(() => {
      try {
        rmSync(path);
      } catch {
        /* ignore */
      }
    });

    const driver = await IdbManifestControlDriverDescriptor.create(path);
    const contract = rawContract({ users: { keyPath: "id" } });

    await instance.sign({ driver, contract, contractPath: "/contract.json" });
    const marker = await instance.readMarker({ driver });

    expect(marker).not.toBeNull();
    expect(marker?.storageHash).toBeDefined();
    expect(marker?.updatedAt).toBeInstanceOf(Date);
  });

  it("verify passes after sign", async () => {
    const path = tmpPath("verify-pass");
    afterEach(() => {
      try {
        rmSync(path);
      } catch {
        /* ignore */
      }
    });

    const driver = await IdbManifestControlDriverDescriptor.create(path);
    const contract = rawContract({ users: { keyPath: "id" } });

    await instance.sign({ driver, contract, contractPath: "/contract.json" });
    const result = await instance.verify({
      driver,
      contract,
      expectedTargetId: "idb",
      contractPath: "/contract.json",
    });

    expect(result.ok).toBe(true);
  });

  it("verify fails with MARKER_MISSING when manifest has no marker", async () => {
    const path = tmpPath("verify-marker-missing");
    const driver = await IdbManifestControlDriverDescriptor.create(path);
    const contract = rawContract({ users: { keyPath: "id" } });

    const result = await instance.verify({
      driver,
      contract,
      expectedTargetId: "idb",
      contractPath: "/contract.json",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("PN-RUN-3001");
  });

  it("verify fails with HASH_MISMATCH when contract changed after sign", async () => {
    const path = tmpPath("verify-hash-mismatch");
    afterEach(() => {
      try {
        rmSync(path);
      } catch {
        /* ignore */
      }
    });

    const driver = await IdbManifestControlDriverDescriptor.create(path);
    const contract1 = rawContract({ users: { keyPath: "id" } });
    const contract2 = rawContract({ users: { keyPath: "id" }, posts: { keyPath: "id" } });

    await instance.sign({ driver, contract: contract1, contractPath: "/contract.json" });
    const result = await instance.verify({
      driver,
      contract: contract2,
      expectedTargetId: "idb",
      contractPath: "/contract.json",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("PN-RUN-3002");
  });

  it("verify fails with TARGET_MISMATCH for wrong targetId", async () => {
    const path = tmpPath("verify-target-mismatch");
    const driver = await IdbManifestControlDriverDescriptor.create(path);
    const contract = rawContract({ users: { keyPath: "id" } });

    const result = await instance.verify({
      driver,
      contract,
      expectedTargetId: "postgres",
      contractPath: "/contract.json",
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe("PN-RUN-3003");
  });

  it("introspect returns empty schema before any manifest exists", async () => {
    const path = tmpPath("introspect-empty");
    const driver = await IdbManifestControlDriverDescriptor.create(path);

    const schema = await instance.introspect({ driver });
    expect(schema.stores).toEqual({});
  });

  it("schemaVerify passes when manifest matches contract", async () => {
    const path = tmpPath("schema-verify-pass");
    afterEach(() => {
      try {
        rmSync(path);
      } catch {
        /* ignore */
      }
    });

    // First write a manifest with the schema.
    const driver = await IdbManifestControlDriverDescriptor.create(path);
    await driver.writeManifest({
      version: 1,
      schema: { stores: { users: { keyPath: "id" } } },
    });

    const contract = rawContract({ users: { keyPath: "id" } });
    const result = await instance.schemaVerify({
      driver,
      contract,
      strict: false,
      contractPath: "/contract.json",
      frameworkComponents: [],
    });

    expect(result.ok).toBe(true);
  });
});
