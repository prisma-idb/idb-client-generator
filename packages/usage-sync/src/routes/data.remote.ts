import { command } from '$app/server';
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
	return await applyPush({
		events,
		scopeKey: (event) => {
			if (event.entityType === 'User') {
				return 'public';
			}
			if (event.entityType === 'Todo') {
				const validation = z.object({ userId: z.string() }).safeParse(event.payload);
				if (validation.success) {
					return `user-${validation.data.userId}`;
				}
			}
			return 'default';
		},
		prisma
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

		const logsWithRecords = await materializeLogs({ logs, prisma });

		return {
			cursor: logs.at(-1)?.id ?? input?.since,
			logsWithRecords
		};
	}
);
