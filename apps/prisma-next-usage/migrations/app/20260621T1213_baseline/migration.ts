#!/usr/bin/env -S npx tsx
import { Migration, MigrationCLI, createIndexOp, createObjectStoreOp } from "@prisma-next-idb/target-idb/migration";

export default class M extends Migration {
  override describe() {
    return {
      from: null,
      to: "sha256:6e7f133567af57688f9750c1c8281785032b1d999366ab78ea34f6fe6064d5a6",
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
