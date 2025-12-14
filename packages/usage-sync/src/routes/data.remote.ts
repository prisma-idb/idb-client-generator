import { command } from "$app/server";
import { applySyncBatch } from "$lib/prisma-idb/server/batch-processor";
import type { OutboxEventRecord } from "$lib/prisma-idb/client/idb-interface";
import z from "zod";

const batchRecordSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  operation: z.enum(["create", "update", "delete"]),
  payload: z.any(),
  clientMeta: z.any().optional(),
  createdAt: z.date(),
  tries: z.number(),
  lastError: z.string().nullable(),
  synced: z.boolean(),
  syncedAt: z.date().nullable(),
});

export const syncBatch = command(
  z.array(batchRecordSchema),
  async (events: OutboxEventRecord[]) => {
    return await applySyncBatch(events);
  }
);