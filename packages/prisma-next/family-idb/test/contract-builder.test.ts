import { domainModelsAtDefaultNamespace } from "@prisma-next/contract/types";
import { describe, expect, it } from "vitest";
import { defineContract } from "../src/core/contract-builder";
import idbFamilyPack from "../src/exports/pack";
import idbTargetPack from "@prisma-next-idb/target-idb/pack";

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

  it("throws when a surviving model's relation points at an excluded model", () => {
    expect(() =>
      defineContract(
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
      )
    ).toThrow(/requires cascading FK projection/);
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
