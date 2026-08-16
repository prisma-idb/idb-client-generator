/**
 * mutation-defaults unit tests.
 *
 * Exercises `applyCreateDefaults`/`applyUpdateDefaults` in isolation against
 * hand-built `ExecutionMutationDefault[]` lists — the PSL → contract wiring
 * that produces these lists (`temporal.updatedAt()`) is covered separately
 * in family-idb's contract-psl.test.ts.
 */
import { describe, expect, it } from "vitest";
import type { ExecutionMutationDefault } from "@prisma-next/contract/types";
import { applyCreateDefaults, applyUpdateDefaults, createMutationDefaultsCache } from "../src/core/mutation-defaults";

const updatedAtDefault: ExecutionMutationDefault = {
  ref: { namespace: "__unbound__", table: "post", column: "updatedAt" },
  onCreate: { kind: "generator", id: "timestampNow" },
  onUpdate: { kind: "generator", id: "timestampNow" },
};

describe("applyCreateDefaults", () => {
  it("fills in a missing column from onCreate", () => {
    const result = applyCreateDefaults([updatedAtDefault], "post", { id: "p1" }, createMutationDefaultsCache());
    expect(result["updatedAt"]).toBeInstanceOf(Date);
    expect(result["id"]).toBe("p1");
  });

  it("does not overwrite a caller-provided value", () => {
    const explicit = new Date("2020-01-01T00:00:00.000Z");
    const result = applyCreateDefaults(
      [updatedAtDefault],
      "post",
      { id: "p1", updatedAt: explicit },
      createMutationDefaultsCache()
    );
    expect(result["updatedAt"]).toBe(explicit);
  });

  it("ignores defaults for other stores", () => {
    const result = applyCreateDefaults([updatedAtDefault], "user", { id: "u1" }, createMutationDefaultsCache());
    expect(result).not.toHaveProperty("updatedAt");
  });

  it("returns the same object reference when there is nothing to apply", () => {
    const data = { id: "p1" };
    const result = applyCreateDefaults(undefined, "post", data, createMutationDefaultsCache());
    expect(result).toBe(data);
  });

  it("shares one generated timestamp across a batch via a shared cache", () => {
    const cache = createMutationDefaultsCache();
    const a = applyCreateDefaults([updatedAtDefault], "post", { id: "p1" }, cache);
    const b = applyCreateDefaults([updatedAtDefault], "post", { id: "p2" }, cache);
    expect(a["updatedAt"]).toBe(b["updatedAt"]);
  });

  it("generates a fresh timestamp per call when given separate caches", async () => {
    const a = applyCreateDefaults([updatedAtDefault], "post", { id: "p1" }, createMutationDefaultsCache());
    await new Promise((r) => setTimeout(r, 2));
    const b = applyCreateDefaults([updatedAtDefault], "post", { id: "p2" }, createMutationDefaultsCache());
    expect((a["updatedAt"] as Date).getTime()).toBeLessThan((b["updatedAt"] as Date).getTime());
  });
});

describe("applyUpdateDefaults", () => {
  it("fills in onUpdate for a non-empty patch", () => {
    const result = applyUpdateDefaults([updatedAtDefault], "post", { title: "new" }, createMutationDefaultsCache());
    expect(result["updatedAt"]).toBeInstanceOf(Date);
  });

  it("does not overwrite a caller-provided value", () => {
    const explicit = new Date("2020-01-01T00:00:00.000Z");
    const result = applyUpdateDefaults(
      [updatedAtDefault],
      "post",
      { updatedAt: explicit },
      createMutationDefaultsCache()
    );
    expect(result["updatedAt"]).toBe(explicit);
  });

  it("skips every onUpdate default for an empty patch", () => {
    const patch = {};
    const result = applyUpdateDefaults([updatedAtDefault], "post", patch, createMutationDefaultsCache());
    expect(result).toBe(patch);
    expect(result).not.toHaveProperty("updatedAt");
  });

  it("ignores defaults for other stores", () => {
    const result = applyUpdateDefaults([updatedAtDefault], "user", { name: "x" }, createMutationDefaultsCache());
    expect(result).not.toHaveProperty("updatedAt");
  });
});
