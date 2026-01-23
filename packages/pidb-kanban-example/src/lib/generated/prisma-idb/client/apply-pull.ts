import type { LogWithRecord } from '../server/batch-processor';
import { validators } from '../validators';
import type { PrismaIDBClient } from './prisma-idb-client';
import { z } from 'zod';

const handlerMap = {
	Board: {
		create: async (client: PrismaIDBClient, record: z.infer<typeof validators.Board>) =>
			client.board.create({ data: record }, { silent: true, addToOutbox: false }),
		update: async (client: PrismaIDBClient, record: z.infer<typeof validators.Board>) =>
			client.board.update(
				{ where: { id: record.id }, data: record },
				{ silent: true, addToOutbox: false }
			),
		delete: async (client: PrismaIDBClient, record: z.infer<typeof validators.Board>) =>
			client.board.delete({ where: { id: record.id } }, { silent: true, addToOutbox: false })
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
	},
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
	Session: {
		create: async (client: PrismaIDBClient, record: z.infer<typeof validators.Session>) =>
			client.session.create({ data: record }, { silent: true, addToOutbox: false }),
		update: async (client: PrismaIDBClient, record: z.infer<typeof validators.Session>) =>
			client.session.update(
				{ where: { id: record.id }, data: record },
				{ silent: true, addToOutbox: false }
			),
		delete: async (client: PrismaIDBClient, record: z.infer<typeof validators.Session>) =>
			client.session.delete({ where: { id: record.id } }, { silent: true, addToOutbox: false })
	},
	Account: {
		create: async (client: PrismaIDBClient, record: z.infer<typeof validators.Account>) =>
			client.account.create({ data: record }, { silent: true, addToOutbox: false }),
		update: async (client: PrismaIDBClient, record: z.infer<typeof validators.Account>) =>
			client.account.update(
				{ where: { id: record.id }, data: record },
				{ silent: true, addToOutbox: false }
			),
		delete: async (client: PrismaIDBClient, record: z.infer<typeof validators.Account>) =>
			client.account.delete({ where: { id: record.id } }, { silent: true, addToOutbox: false })
	},
	Verification: {
		create: async (client: PrismaIDBClient, record: z.infer<typeof validators.Verification>) =>
			client.verification.create({ data: record }, { silent: true, addToOutbox: false }),
		update: async (client: PrismaIDBClient, record: z.infer<typeof validators.Verification>) =>
			client.verification.update(
				{ where: { id: record.id }, data: record },
				{ silent: true, addToOutbox: false }
			),
		delete: async (client: PrismaIDBClient, record: z.infer<typeof validators.Verification>) =>
			client.verification.delete({ where: { id: record.id } }, { silent: true, addToOutbox: false })
	}
};
export async function applyPull(
	idbClient: PrismaIDBClient,
	logsWithRecords: LogWithRecord<typeof validators>[]
) {
	let missingRecords = 0;

	for (const change of logsWithRecords) {
		const { model, operation, record } = change;
		if (!record) {
			missingRecords++;
			continue;
		}

		if (model === 'Board') {
			const validatedRecord = validators.Board.parse(record);
			const handler = handlerMap.Board[operation];
			await handler(idbClient, validatedRecord);
		} else if (model === 'Todo') {
			const validatedRecord = validators.Todo.parse(record);
			const handler = handlerMap.Todo[operation];
			await handler(idbClient, validatedRecord);
		} else if (model === 'User') {
			const validatedRecord = validators.User.parse(record);
			const handler = handlerMap.User[operation];
			await handler(idbClient, validatedRecord);
		} else if (model === 'Session') {
			const validatedRecord = validators.Session.parse(record);
			const handler = handlerMap.Session[operation];
			await handler(idbClient, validatedRecord);
		} else if (model === 'Account') {
			const validatedRecord = validators.Account.parse(record);
			const handler = handlerMap.Account[operation];
			await handler(idbClient, validatedRecord);
		} else if (model === 'Verification') {
			const validatedRecord = validators.Verification.parse(record);
			const handler = handlerMap.Verification[operation];
			await handler(idbClient, validatedRecord);
		}
	}

	return { missingRecords, totalAppliedRecords: logsWithRecords.length - missingRecords };
}
