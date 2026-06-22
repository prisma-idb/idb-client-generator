#!/usr/bin/env -S npx tsx
import { Migration, MigrationCLI, createIndexOp, createObjectStoreOp } from "@prisma-next-idb/target-idb/migration";

export default class M extends Migration {
  override describe() {
    return {
      from: "sha256:004f476119390a4c2e8ea6d507ac5e9707c7d58d65be963316b827ef42fb756b",
      to: "sha256:3960fb5561eb9dfea1e51a4fbcb3f1b717d275317e32e95db2949d0737770425",
    };
  }

  override get operations() {
    return [
      createObjectStoreOp("board", { keyPath: "id" }),
      createIndexOp("board", "userId", { keyPath: "userId", unique: false }),
      createObjectStoreOp("todo", { keyPath: "id" }),
      createIndexOp("todo", "boardId", { keyPath: "boardId", unique: false }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
