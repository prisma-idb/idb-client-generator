import { createContract } from "@prisma-next/contract/testing";
import type { ContractModel } from "@prisma-next/contract/types";
import { describe, expect, it } from "vitest";
import { idbEmission } from "../src/core/emission";
import { validateContract } from "../src/core/validate";

// ── Test helpers ──────────────────────────────────────────────────────────────

/** Minimal IDB contract with two stores used across emission tests. */
const minimalIdbContract = createContract({
  target: "idb",
  targetFamily: "idb",
  storage: {
    stores: {
      posts: {
        keyPath: "id",
      },
      users: {
        keyPath: "id",
        indexes: {
          byEmail: { keyPath: "email", unique: true },
        },
      },
    },
  },
  models: {
    Post: { fields: {}, relations: {}, storage: { storeName: "posts", keyPath: "id" } },
    User: { fields: {}, relations: {}, storage: { storeName: "users", keyPath: "id" } },
  },
});

/** Builds a structurally valid raw contract object overriding only `storage`. */
function makeRawWithStorage(storage: Record<string, unknown>) {
  return {
    target: "idb",
    targetFamily: "idb",
    roots: {},
    models: {},
    storage,
    capabilities: {},
    extensionPacks: {},
    meta: {},
    profileHash: "sha256:test",
  };
}

// ── emission ──────────────────────────────────────────────────────────────────

describe("idbEmission", () => {
  describe("generateStorageType", () => {
    it("serializes stores into a TypeScript type literal", () => {
      const result = idbEmission.generateStorageType(minimalIdbContract, "StorageHash");
      // Stores are sorted alphabetically (posts before users).
      expect(result).toContain("readonly posts:");
      expect(result).toContain("readonly users:");
      // posts store — no indexes, no autoIncrement
      expect(result).toContain("readonly keyPath: 'id'");
      expect(result).toContain("readonly indexes: Record<string, never>");
      // users store — has a byEmail index
      expect(result).toContain("readonly byEmail:");
      expect(result).toContain("readonly unique: true");
      // trailing storageHash placeholder
      expect(result).toContain("readonly storageHash: StorageHash");
    });

    it("serializes an index with keyPath and unique", () => {
      const result = idbEmission.generateStorageType(minimalIdbContract, "H");
      expect(result).toContain("readonly keyPath: 'email'; readonly unique: true");
    });

    it("emits autoIncrement when present on a store", () => {
      const contract = createContract({
        target: "idb",
        targetFamily: "idb",
        storage: {
          stores: {
            items: { keyPath: "id", autoIncrement: true },
          },
        },
        models: { Item: { fields: {}, relations: {}, storage: { storeName: "items", keyPath: "id" } } },
      });
      const result = idbEmission.generateStorageType(contract, "H");
      expect(result).toContain("readonly autoIncrement: true");
    });

    it("emits multiEntry when present on an index", () => {
      const contract = createContract({
        target: "idb",
        targetFamily: "idb",
        storage: {
          stores: {
            items: {
              keyPath: "id",
              indexes: {
                byTags: { keyPath: "tags", unique: false, multiEntry: true },
              },
            },
          },
        },
        models: { Item: { fields: {}, relations: {}, storage: { storeName: "items", keyPath: "id" } } },
      });
      const result = idbEmission.generateStorageType(contract, "H");
      expect(result).toContain("readonly multiEntry: true");
      expect(result).toContain("readonly unique: false");
    });

    it("returns a Record<string, never> stores type for an empty stores object", () => {
      const contract = createContract({
        target: "idb",
        targetFamily: "idb",
        storage: { stores: {} },
        models: {},
      });
      const result = idbEmission.generateStorageType(contract, "H");
      expect(result).toContain("readonly stores: Record<string, never>");
    });
  });

  describe("generateModelStorageType", () => {
    it("serializes a model's IDB storage metadata", () => {
       
      const model = minimalIdbContract.models["Post"]!;
      const result = idbEmission.generateModelStorageType("Post", model);
      expect(result).toBe("{ readonly storeName: 'posts'; readonly keyPath: 'id' }");
    });

    it("handles store names with hyphens (requires quoting)", () => {
      const model = {
        storage: { storeName: "my-store", keyPath: "id" },
      } as unknown as ContractModel;
      const result = idbEmission.generateModelStorageType("Foo", model);
      expect(result).toContain("'my-store'");
    });
  });

  describe("getFamilyImports", () => {
    it("returns an array with the IDB type import", () => {
      const imports = idbEmission.getFamilyImports();
      expect(imports).toHaveLength(1);
      expect(imports[0]).toContain("IdbContractWithTypeMaps");
      expect(imports[0]).toContain("IdbTypeMaps");
      expect(imports[0]).toContain("@prisma-next-idb/target-idb/pack");
    });
  });

  describe("getFamilyTypeAliases", () => {
    it("exports LaneCodecTypes as CodecTypes", () => {
      expect(idbEmission.getFamilyTypeAliases()).toBe("export type LaneCodecTypes = CodecTypes;");
    });
  });

  describe("getTypeMapsExpression", () => {
    it("returns an IdbTypeMaps generic instantiation", () => {
      expect(idbEmission.getTypeMapsExpression()).toBe("IdbTypeMaps<CodecTypes, FieldOutputTypes, FieldInputTypes>");
    });
  });

  describe("getContractWrapper", () => {
    it("wraps the base contract with IdbContractWithTypeMaps and adds Stores/Models", () => {
      const result = idbEmission.getContractWrapper("ContractBase", "TypeMaps");
      expect(result).toContain("export type Contract = IdbContractWithTypeMaps<ContractBase, TypeMaps>;");
      expect(result).toContain("export type Stores = Contract['storage']['stores'];");
      expect(result).toContain("export type Models = Contract['models'];");
    });
  });
});

// ── validateContract ──────────────────────────────────────────────────────────

describe("validateContract", () => {
  it("accepts a valid IDB contract produced by createContract", () => {
    expect(() => validateContract(minimalIdbContract)).not.toThrow();
    const result = validateContract(minimalIdbContract);
    expect(result.targetFamily).toBe("idb");
  });

  it("returns a contract with the correct storage shape", () => {
    const result = validateContract(minimalIdbContract);
    const storage = result.storage as { stores: Record<string, unknown>; storageHash: string };
    expect(storage.stores).toHaveProperty("posts");
    expect(storage.stores).toHaveProperty("users");
    expect(typeof storage.storageHash).toBe("string");
  });

  it("throws when storage.stores is missing", () => {
    const raw = makeRawWithStorage({ storageHash: "sha256:x" });
    expect(() => validateContract(raw)).toThrowError(/storage\.stores|IDB contract must have/);
  });

  it("throws when storage is null", () => {
    expect(() => validateContract(null)).toThrowError();
  });

  it("throws when storage.stores is not an object", () => {
    const raw = makeRawWithStorage({ stores: "bad", storageHash: "sha256:x" });
    expect(() => validateContract(raw)).toThrowError();
  });

  it("throws when a store is missing keyPath", () => {
    const raw = makeRawWithStorage({
      stores: { posts: { autoIncrement: false } },
      storageHash: "sha256:x",
    });
    expect(() => validateContract(raw)).toThrowError(/keyPath/);
  });

  it("throws when a store has an empty string keyPath", () => {
    const raw = makeRawWithStorage({
      stores: { posts: { keyPath: "" } },
      storageHash: "sha256:x",
    });
    expect(() => validateContract(raw)).toThrowError(/keyPath/);
  });

  it("throws when a model references a non-existent store", () => {
    const raw = {
      target: "idb",
      targetFamily: "idb",
      roots: {},
      models: {
        Post: { fields: {}, storage: { storeName: "ghost-store", keyPath: "id" } },
      },
      storage: { stores: { posts: { keyPath: "id" } }, storageHash: "sha256:x" },
      capabilities: {},
      extensionPacks: {},
      meta: {},
      profileHash: "sha256:test",
    };
    expect(() => validateContract(raw)).toThrowError(/ghost-store/);
  });

  it("throws when a model is missing storage.storeName", () => {
    const raw = {
      target: "idb",
      targetFamily: "idb",
      roots: {},
      models: {
        Post: { fields: {}, storage: { keyPath: "id" } },
      },
      storage: { stores: { posts: { keyPath: "id" } }, storageHash: "sha256:x" },
      capabilities: {},
      extensionPacks: {},
      meta: {},
      profileHash: "sha256:test",
    };
    expect(() => validateContract(raw)).toThrowError(/storeName/);
  });
});
