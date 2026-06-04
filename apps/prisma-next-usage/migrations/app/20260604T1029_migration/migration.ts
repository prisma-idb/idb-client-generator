#!/usr/bin/env -S npx tsx
import { Migration, MigrationCLI, createObjectStoreOp, createIndexOp } from "@prisma-next-idb/target-idb/migration";

export default class M extends Migration {
  override describe() {
    return {
      from: "sha256:46a587fce453e2298b888ce5307312ac010fafb203b9f0ab188eb4fb6be17bc0",
      to: "sha256:b05717321fba711de059ca6e508f0f2087f2eaca7de74beb8f969ac5f0c606d9",
    };
  }

  override get operations() {
    return [
      createObjectStoreOp("posts", { keyPath: "id" }),
      createIndexOp("posts", "byAuthorId", { keyPath: "authorId", unique: false }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
