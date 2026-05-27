#!/usr/bin/env -S npx tsx
import { Migration, MigrationCLI, createIndexOp, createObjectStoreOp } from "@prisma-next-idb/target-idb/migration";

export default class M extends Migration {
  override describe() {
    return {
      from: null,
      to: "sha256:c1ad80d3bd2f9f5db48c5126fe1257ba9817ddc6ba0a8af9453e39f17d76dd30",
    };
  }

  override get operations() {
    return [
      createObjectStoreOp("_prisma_next_marker", { keyPath: "space" }),
      createObjectStoreOp("posts", { keyPath: "id" }),
      createIndexOp("posts", "byAuthorId", { keyPath: "authorId", unique: false }),
      createObjectStoreOp("users", { keyPath: "id" }),
      createIndexOp("users", "byEmail", { keyPath: "email", unique: true }),
      createIndexOp("users", "byScore", { keyPath: "score", unique: false }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
