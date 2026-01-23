import { command, getRequestEvent } from '$app/server';
import { applyPush, materializeLogs } from '$lib/generated/prisma-idb/server/batch-processor';
import { prisma } from '$lib/server/prisma';
import { error } from '@sveltejs/kit';
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

export const syncPush = command(z.array(batchRecordSchema), async (events) => {
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

export const syncPull = command(
	z.object({ lastChangelogId: z.bigint().optional() }).optional(),
	async (input) => {
		const { cookies } = getRequestEvent();
		const sessionToken = cookies.get('better-auth.session_token')?.split('.')[0];

		const user = await prisma.user.findFirst({
			where: { sessions: { some: { token: sessionToken } } }
		});

		if (!user) error(401, 'Unauthorized');

		const logs = await prisma.changeLog.findMany({
			where: {
				scopeKey: user.id,
				id: { gt: input?.lastChangelogId ?? 0n }
			},
			orderBy: { id: 'asc' },
			take: 50
		});

		const logsWithRecords = await materializeLogs({ logs, prisma });

		return {
			cursor: BigInt(logs.at(-1)?.id ?? input?.lastChangelogId ?? 0n),
			logsWithRecords
		};
	}
);
