#!/usr/bin/env -S npx tsx
import { Migration, MigrationCLI, createObjectStoreOp } from "@prisma-next-idb/target-idb/migration";

export default class M extends Migration {
  override describe() {
    return {
      from: "sha256:c1ad80d3bd2f9f5db48c5126fe1257ba9817ddc6ba0a8af9453e39f17d76dd30",
      to: "sha256:9a439471a6c17853ccf264236b1ef6a4ab268c165938886dd63fab2309eeeff8",
    };
  }

  override get operations() {
    return [createObjectStoreOp("random_store", { keyPath: "id" })];
  }
}

MigrationCLI.run(import.meta.url, M);
