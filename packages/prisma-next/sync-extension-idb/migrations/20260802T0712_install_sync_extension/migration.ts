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
      createObjectStoreOp("_idb_sync_outbox", {
        keyPath: "id",
        indexes: { byCreatedAt: { keyPath: "createdAt" }, bySynced: { keyPath: "synced" } },
      }),
      createIndexOp("_idb_sync_outbox", "byCreatedAt", { keyPath: "createdAt" }),
      createIndexOp("_idb_sync_outbox", "bySynced", { keyPath: "synced" }),
      createObjectStoreOp("_idb_sync_version_meta", { keyPath: "id" }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
