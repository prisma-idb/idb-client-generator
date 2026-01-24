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
	createdAt: z.coerce.date(),
	tries: z.number(),
	lastError: z.string().nullable(),
	synced: z.boolean(),
	syncedAt: z.coerce.date().nullable()
});

async function getAuthenticatedUser() {
	const { cookies } = getRequestEvent();
	const sessionToken = cookies.get('better-auth.session_token')?.split('.')[0];
	if (!sessionToken) throw error(401, 'Unauthorized');

	const user = await prisma.user.findFirst({
		where: { sessions: { some: { token: sessionToken } } }
	});
	if (!user) throw error(401, 'Unauthorized');
	return user;
}

export const syncPush = command(z.array(batchRecordSchema), async (events) => {
	const user = await getAuthenticatedUser();

	// Validate that all events have supported entity types and proper authorization
	const validatedEvents: z.infer<typeof batchRecordSchema>[] = [];
	for (const event of events) {
		// Only allow Board and Todo entity types
		if (event.entityType !== 'Board' && event.entityType !== 'Todo') {
			throw error(400, `Unsupported entityType: ${event.entityType}`);
		}

		// Validate userId in payload matches authenticated user
		const validation = z.object({ userId: z.string() }).safeParse(event.payload);
		if (!validation.success || validation.data.userId !== user.id) {
			throw error(401, 'Unauthorized: userId mismatch or missing');
		}

		validatedEvents.push(event);
	}

	return await applyPush({
		events: validatedEvents,
		scopeKey: () => `user-${user.id}`,
		prisma
	});
});

export const syncPull = command(
	z.object({ lastChangelogId: z.bigint().optional() }).optional(),
	async (input) => {
		const user = await getAuthenticatedUser();

		const logs = await prisma.changeLog.findMany({
			where: {
				scopeKey: `user-${user.id}`,
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
