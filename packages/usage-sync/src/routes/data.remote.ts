import { command } from '$app/server';
import { applySyncBatch } from '$lib/prisma-idb/server/batch-processor';
import z from 'zod';

const batchRecordSchema = z.object({
	id: z.string(),
	entityType: z.string(),
	entityKeyPath: z.array(z.any()),
	operation: z.enum(['create', 'update', 'delete']),
	payload: z.any(),
	clientMeta: z.any().optional(),
	createdAt: z.date(),
	tries: z.number(),
	lastError: z.string().nullable(),
	synced: z.boolean(),
	syncedAt: z.date().nullable()
});

export const syncBatch = command(z.array(batchRecordSchema), async (events) => {
	return await applySyncBatch(events);
});
