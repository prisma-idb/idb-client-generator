import { domainModelsAtDefaultNamespace } from "@prisma-next/contract/types";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineContract } from "../src/core/contract-builder";
import idbFamilyPack from "../src/exports/pack";
import idbTargetPack from "@prisma-next-idb/target-idb/pack";

let warnSpy: MockInstance<(...args: unknown[]) => void>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe("defineContract — @idb.exclude projection (ADR 012)", () => {
  it("ignores exclude/excludeFields entirely in full projection (default)", () => {
    const contract = defineContract({
      family: idbFamilyPack,
      target: idbTargetPack,
      models: {
        User: {
          store: "users",
          key: "id",
          fields: { id: "String", name: "String", passwordHash: "String" },
          excludeFields: ["passwordHash"],
        },
        AuditLog: {
          store: "auditLog",
          key: "id",
          fields: { id: "String" },
          exclude: true,
        },
      },
    });

    const models = domainModelsAtDefaultNamespace(contract.domain) as Record<string, { fields: object }>;
    expect(models).toHaveProperty("User");
    expect(models).toHaveProperty("AuditLog");
    expect(models["User"]!.fields).toHaveProperty("passwordHash");
  });

  it("drops excludeFields entries in client projection", () => {
    const contract = defineContract(
      {
        family: idbFamilyPack,
        target: idbTargetPack,
        models: {
          User: {
            store: "users",
            key: "id",
            fields: { id: "String", name: "String", passwordHash: "String" },
            excludeFields: ["passwordHash"],
          },
        },
      },
      { projection: "client" }
    );

    const models = domainModelsAtDefaultNamespace(contract.domain) as Record<string, { fields: object }>;
    expect(models["User"]!.fields).toHaveProperty("name");
    expect(models["User"]!.fields).not.toHaveProperty("passwordHash");
  });

  it("drops exclude: true models in client projection", () => {
    const contract = defineContract(
      {
        family: idbFamilyPack,
        target: idbTargetPack,
        models: {
          User: { store: "users", key: "id", fields: { id: "String" } },
          AuditLog: { store: "auditLog", key: "id", fields: { id: "String" }, exclude: true },
        },
      },
      { projection: "client" }
    );

    const models = domainModelsAtDefaultNamespace(contract.domain) as Record<string, unknown>;
    expect(models).toHaveProperty("User");
    expect(models).not.toHaveProperty("AuditLog");
    expect(contract.storage.stores).not.toHaveProperty("auditLog");
    expect(contract.roots).not.toHaveProperty("auditLog");
  });

  it("throws when excluding the model's own key field", () => {
    expect(() =>
      defineContract(
        {
          family: idbFamilyPack,
          target: idbTargetPack,
          models: {
            User: { store: "users", key: "id", fields: { id: "String" }, excludeFields: ["id"] },
          },
        },
        { projection: "client" }
      )
    ).toThrow(/excludes its own key field/);
  });

  it("throws when an index references an excluded field", () => {
    expect(() =>
      defineContract(
        {
          family: idbFamilyPack,
          target: idbTargetPack,
          models: {
            User: {
              store: "users",
              key: "id",
              fields: { id: "String", email: "String" },
              indexes: { byEmail: { keyPath: "email", unique: true } },
              excludeFields: ["email"],
            },
          },
        },
        { projection: "client" }
      )
    ).toThrow(/references excluded field/);
  });

  it("throws when excluding a scalar field that backs a relation's FK", () => {
    expect(() =>
      defineContract(
        {
          family: idbFamilyPack,
          target: idbTargetPack,
          models: {
            User: { store: "users", key: "id", fields: { id: "String" } },
            Post: {
              store: "posts",
              key: "id",
              fields: { id: "String", userId: "String" },
              excludeFields: ["userId"],
              relations: {
                user: { to: "User", cardinality: "N:1", on: { local: ["userId"], target: ["id"] } },
              },
            },
          },
        },
        { projection: "client" }
      )
    ).toThrow(/cannot be excluded independently/);
  });

  it("throws when a relation references an excluded unique field on the target model", () => {
    expect(() =>
      defineContract(
        {
          family: idbFamilyPack,
          target: idbTargetPack,
          models: {
            User: {
              store: "users",
              key: "id",
              fields: { id: "String", email: "String" },
              excludeFields: ["email"],
            },
            Post: {
              store: "posts",
              key: "id",
              fields: { id: "String", userEmail: "String" },
              relations: {
                user: { to: "User", cardinality: "N:1", on: { local: ["userEmail"], target: ["email"] } },
              },
            },
          },
        },
        { projection: "client" }
      )
    ).toThrow(/references excluded field/);
  });

  it("throws when excludeFields references a field not declared on the model", () => {
    expect(() =>
      defineContract(
        {
          family: idbFamilyPack,
          target: idbTargetPack,
          models: {
            User: { store: "users", key: "id", fields: { id: "String" }, excludeFields: ["typoField"] },
          },
        },
        { projection: "client" }
      )
    ).toThrow(/unknown field/);
  });

  it("excludes a self-contained model with no relations cleanly", () => {
    const contract = defineContract(
      {
        family: idbFamilyPack,
        target: idbTargetPack,
        models: {
          User: { store: "users", key: "id", fields: { id: "String" } },
          AuditLog: {
            store: "auditLog",
            key: "id",
            fields: { id: "String", action: "String" },
            exclude: true,
          },
        },
      },
      { projection: "client" }
    );

    expect(Object.keys(contract.storage.stores)).toEqual(["users"]);
  });
});

describe("defineContract — FK projection cascade (ADR 013)", () => {
  it("drops a required N:1 relation to an excluded model, keeping the model and its FK scalar field", () => {
    const contract = defineContract(
      {
        family: idbFamilyPack,
        target: idbTargetPack,
        models: {
          User: { store: "users", key: "id", fields: { id: "String" }, exclude: true },
          Post: {
            store: "posts",
            key: "id",
            fields: { id: "String", userId: "String" },
            relations: {
              user: { to: "User", cardinality: "N:1", on: { local: ["userId"], target: ["id"] } },
            },
          },
        },
      },
      { projection: "client" }
    );

    expect(Object.keys(contract.storage.stores)).toEqual(["posts"]);
    const models = domainModelsAtDefaultNamespace(contract.domain) as Record<
      string,
      { fields: object; relations: object }
    >;
    expect(models).not.toHaveProperty("User");
    expect(models).toHaveProperty("Post");
    expect(models["Post"]!.relations).not.toHaveProperty("user");
    // The orphaned FK scalar field is kept, per ADR 013, even though it was required.
    expect(models["Post"]!.fields).toHaveProperty("userId");

    const warnings = warnSpy.mock.calls.map((call) => String(call[0]));
    expect(warnings.some((w) => w.includes('"Post.user"') && w.includes("excluded"))).toBe(true);
  });

  it("does not cascade through a chain of required relations — only the directly-excluded model's relation is dropped", () => {
    const contract = defineContract(
      {
        family: idbFamilyPack,
        target: idbTargetPack,
        models: {
          C: { store: "c", key: "id", fields: { id: "String" }, exclude: true },
          B: {
            store: "b",
            key: "id",
            fields: { id: "String", cId: "String" },
            relations: { c: { to: "C", cardinality: "N:1", on: { local: ["cId"], target: ["id"] } } },
          },
          A: {
            store: "a",
            key: "id",
            fields: { id: "String", bId: "String" },
            relations: { b: { to: "B", cardinality: "N:1", on: { local: ["bId"], target: ["id"] } } },
          },
        },
      },
      { projection: "client" }
    );

    // B and A both survive — only C (the explicitly excluded model) is gone.
    // A's relation to B is untouched since B was never excluded.
    expect(Object.keys(contract.storage.stores).sort()).toEqual(["a", "b"]);
    const models = domainModelsAtDefaultNamespace(contract.domain) as Record<string, { relations: object }>;
    expect(models["B"]!.relations).not.toHaveProperty("c");
    expect(models["A"]!.relations).toHaveProperty("b");
  });

  it("keeps a required N:1 relation whose target survives", () => {
    const contract = defineContract(
      {
        family: idbFamilyPack,
        target: idbTargetPack,
        models: {
          User: { store: "users", key: "id", fields: { id: "String" } },
          Post: {
            store: "posts",
            key: "id",
            fields: { id: "String", userId: "String" },
            relations: {
              user: { to: "User", cardinality: "N:1", on: { local: ["userId"], target: ["id"] } },
            },
          },
        },
      },
      { projection: "client" }
    );

    const models = domainModelsAtDefaultNamespace(contract.domain) as Record<string, { relations: object }>;
    expect(models["Post"]!.relations).toHaveProperty("user");
  });
});
