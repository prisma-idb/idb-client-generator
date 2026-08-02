#!/usr/bin/env -S npx tsx
import { Migration, MigrationCLI, createIndexOp, createObjectStoreOp } from "@prisma-next-idb/target-idb/migration";

export default class M extends Migration {
  override describe() {
    return {
      from: null,
      to: "sha256:7fde36649c356a3b6962006d44bb08e84372aa86bb23671252eab9b4cf45e798",
    };
  }

  override get operations() {
    return [
      createObjectStoreOp("_prisma_next_marker", { keyPath: "space" }),
      createObjectStoreOp("_idb_sync_outbox", { keyPath: "id" }),
      createIndexOp("_idb_sync_outbox", "byCreatedAt", { keyPath: "createdAt", unique: false }),
      createIndexOp("_idb_sync_outbox", "bySynced", { keyPath: "synced", unique: false }),
      createObjectStoreOp("_idb_sync_version_meta", { keyPath: "id" }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
