#!/usr/bin/env -S npx tsx
import { Migration, MigrationCLI, createIndexOp, createObjectStoreOp } from "@prisma-next-idb/target-idb/migration";

export default class M extends Migration {
  override describe() {
    return {
      from: "sha256:6e7f133567af57688f9750c1c8281785032b1d999366ab78ea34f6fe6064d5a6",
      to: "sha256:e8f91dccffdb18ae207ff36b9238a31e7ff38bf0b54079f0a3b0de97b81dda21",
    };
  }

  override get operations() {
    return [
      createObjectStoreOp("tags", { keyPath: "id" }),
      createIndexOp("tags", "byPostId", { keyPath: "postId", unique: false }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
