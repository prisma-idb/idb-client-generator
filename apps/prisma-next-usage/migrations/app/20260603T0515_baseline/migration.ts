#!/usr/bin/env -S npx tsx
import { Migration, MigrationCLI, createIndexOp, createObjectStoreOp } from "@prisma-next-idb/target-idb/migration";

export default class M extends Migration {
  override describe() {
    return {
      from: null,
      to: "sha256:b05717321fba711de059ca6e508f0f2087f2eaca7de74beb8f969ac5f0c606d9",
    };
  }

  override get operations() {
    return [
      createObjectStoreOp("_prisma_next_marker", { keyPath: "space" }),
      createObjectStoreOp("posts", { keyPath: "id" }),
      createIndexOp("posts", "byAuthorId", { keyPath: "authorId", unique: false }),
      createObjectStoreOp("random_store", { keyPath: "id" }),
      createObjectStoreOp("users", { keyPath: "id" }),
      createIndexOp("users", "byEmail", { keyPath: "email", unique: true }),
      createIndexOp("users", "byScore", { keyPath: "score", unique: false }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
