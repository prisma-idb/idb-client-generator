import type { LogsWithRecords } from '../server/batch-processor';
import { validators } from '../validators';
import type { PrismaIDBClient } from './prisma-idb-client';
import { z } from 'zod';

const handlerMap = {
	User: {
		create: async (client: PrismaIDBClient, record: z.infer<typeof validators.User>) =>
			client.user.create({ data: record }, undefined, true),
		update: async (client: PrismaIDBClient, record: z.infer<typeof validators.User>) =>
			client.user.update({ where: { id: record.id }, data: record }, undefined, true),
		delete: async (client: PrismaIDBClient, record: z.infer<typeof validators.User>) =>
			client.user.delete({ where: { id: record.id } }, undefined, true)
	},
	Todo: {
		create: async (client: PrismaIDBClient, record: z.infer<typeof validators.Todo>) =>
			client.todo.create({ data: record }, undefined, true),
		update: async (client: PrismaIDBClient, record: z.infer<typeof validators.Todo>) =>
			client.todo.update({ where: { id: record.id }, data: record }, undefined, true),
		delete: async (client: PrismaIDBClient, record: z.infer<typeof validators.Todo>) =>
			client.todo.delete({ where: { id: record.id } }, undefined, true)
	}
};
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
