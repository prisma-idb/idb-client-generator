#!/usr/bin/env -S npx tsx
import { Migration, MigrationCLI, createIndexOp, createObjectStoreOp } from "@prisma-next-idb/target-idb/migration";

export default class M extends Migration {
  override describe() {
    return {
      from: null,
      to: "sha256:46a587fce453e2298b888ce5307312ac010fafb203b9f0ab188eb4fb6be17bc0",
    };
  }

  override get operations() {
    return [
      createObjectStoreOp("_prisma_next_marker", { keyPath: "space" }),
      createObjectStoreOp("random_store", { keyPath: "id" }),
      createObjectStoreOp("users", { keyPath: "id" }),
      createIndexOp("users", "byEmail", { keyPath: "email", unique: true }),
      createIndexOp("users", "byScore", { keyPath: "score", unique: false }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
