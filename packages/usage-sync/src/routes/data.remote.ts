import { command } from '$app/server';
import type { Todo } from '$lib/generated/prisma/client';
import { prisma } from '$lib/prisma';
import { applyPush, materializeLogs } from '$lib/prisma-idb/server/batch-processor';
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
	return await applyPush(events, (event) => {
		if (event.entityType === 'User') {
			return 'public';
		}
		if (event.entityType === 'Todo') {
			const userId = (event.payload as Todo).userId;
			return `user-${userId}`;
		}
		return 'default';
	});
});

export const pullChanges = command(
	z
		.object({
			since: z.number().int().optional(),
			scopeKey: z.string().optional()
		})
		.optional(),
	async (input) => {
		const logs = await prisma.changeLog.findMany({
			where: {
				scopeKey: input?.scopeKey,
				id: { gt: input?.since ?? 0 }
			},
			orderBy: { id: 'asc' },
			take: 500 // paginate, don’t be greedy
		});

		const logsWithRecords = await materializeLogs(logs);

		return {
			cursor: logs.at(-1)?.id ?? input?.since,
			logsWithRecords
		};
	}
);
