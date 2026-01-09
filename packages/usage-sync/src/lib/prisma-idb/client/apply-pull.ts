import type { LogsWithRecords } from '../server/batch-processor';
import { validators } from '../validators';
import type { PrismaIDBClient } from './prisma-idb-client';
import { z } from 'zod';

const handlerMap = {
	User: {
		create: async (client: PrismaIDBClient, record: z.infer<typeof validators.User>) =>
			client.user.create({ data: record }, { silent: true, addToOutbox: false }),
		update: async (client: PrismaIDBClient, record: z.infer<typeof validators.User>) =>
			client.user.update(
				{ where: { id: record.id }, data: record },
				{ silent: true, addToOutbox: false }
			),
		delete: async (client: PrismaIDBClient, record: z.infer<typeof validators.User>) =>
			client.user.delete({ where: { id: record.id } }, { silent: true, addToOutbox: false })
	},
	Todo: {
		create: async (client: PrismaIDBClient, record: z.infer<typeof validators.Todo>) =>
			client.todo.create({ data: record }, { silent: true, addToOutbox: false }),
		update: async (client: PrismaIDBClient, record: z.infer<typeof validators.Todo>) =>
			client.todo.update(
				{ where: { id: record.id }, data: record },
				{ silent: true, addToOutbox: false }
			),
		delete: async (client: PrismaIDBClient, record: z.infer<typeof validators.Todo>) =>
			client.todo.delete({ where: { id: record.id } }, { silent: true, addToOutbox: false })
	}
};
/**
 * Apply a sequence of pulled change logs to the local Prisma IDB client.
 *
 * @param logsWithRecords - Array of change logs (model, operation, record); entries with a falsy `record` are counted as missing and skipped
 * @returns An object containing:
 *   - `missingRecords`: the number of changes that had no `record`
 *   - `totalAppliedRecords`: the number of changes that were applied
 */
export async function applyPull(
	idbClient: PrismaIDBClient,
	logsWithRecords: LogsWithRecords<typeof validators>[]
) {
	let missingRecords = 0;

	for (const change of logsWithRecords) {
		const { model, operation, record } = change;
		if (!record) {
			missingRecords++;
			continue;
		}

		if (model === 'User') {
			const handler = handlerMap.User[operation];
			await handler(idbClient, record);
		} else if (model === 'Todo') {
			const handler = handlerMap.Todo[operation];
			await handler(idbClient, record);
		}
	}

	return { missingRecords, totalAppliedRecords: logsWithRecords.length - missingRecords };
}