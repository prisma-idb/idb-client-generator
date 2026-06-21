#!/usr/bin/env -S npx tsx
import { Migration, MigrationCLI, createIndexOp, createObjectStoreOp } from "@prisma-next-idb/target-idb/migration";

export default class M extends Migration {
  override describe() {
    return {
      from: null,
      to: "sha256:004f476119390a4c2e8ea6d507ac5e9707c7d58d65be963316b827ef42fb756b",
    };
  }

  override get operations() {
    return [
      createObjectStoreOp("_prisma_next_marker", { keyPath: "space" }),
      createObjectStoreOp("user", { keyPath: "id" }),
      createIndexOp("user", "email_unique", { keyPath: "email", unique: true }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
