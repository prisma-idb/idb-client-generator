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
	const validationErrors: { model: string; error: unknown }[] = [];

	for (const change of logsWithRecords) {
		const { model, operation, record } = change;
		if (!record) {
			missingRecords++;
			continue;
		}

		if (model === 'Board') {
			try {
				const validatedRecord = validators.Board.parse(record);
				const handler = handlerMap.Board[operation];
				if (!handler) {
					console.warn('Unknown operation for Board:', operation);
					continue;
				}
				await handler(idbClient, validatedRecord);
			} catch (error) {
				validationErrors.push({ model: 'Board', error });
				continue;
			}
		} else if (model === 'Todo') {
			try {
				const validatedRecord = validators.Todo.parse(record);
				const handler = handlerMap.Todo[operation];
				if (!handler) {
					console.warn('Unknown operation for Todo:', operation);
					continue;
				}
				await handler(idbClient, validatedRecord);
			} catch (error) {
				validationErrors.push({ model: 'Todo', error });
				continue;
			}
		} else if (model === 'User') {
			try {
				const validatedRecord = validators.User.parse(record);
				const handler = handlerMap.User[operation];
				if (!handler) {
					console.warn('Unknown operation for User:', operation);
					continue;
				}
				await handler(idbClient, validatedRecord);
			} catch (error) {
				validationErrors.push({ model: 'User', error });
				continue;
			}
		} else if (model === 'Session') {
			try {
				const validatedRecord = validators.Session.parse(record);
				const handler = handlerMap.Session[operation];
				if (!handler) {
					console.warn('Unknown operation for Session:', operation);
					continue;
				}
				await handler(idbClient, validatedRecord);
			} catch (error) {
				validationErrors.push({ model: 'Session', error });
				continue;
			}
		} else if (model === 'Account') {
			try {
				const validatedRecord = validators.Account.parse(record);
				const handler = handlerMap.Account[operation];
				if (!handler) {
					console.warn('Unknown operation for Account:', operation);
					continue;
				}
				await handler(idbClient, validatedRecord);
			} catch (error) {
				validationErrors.push({ model: 'Account', error });
				continue;
			}
		} else if (model === 'Verification') {
			try {
				const validatedRecord = validators.Verification.parse(record);
				const handler = handlerMap.Verification[operation];
				if (!handler) {
					console.warn('Unknown operation for Verification:', operation);
					continue;
				}
				await handler(idbClient, validatedRecord);
			} catch (error) {
				validationErrors.push({ model: 'Verification', error });
				continue;
			}
		}
	}

	return {
		missingRecords,
		totalAppliedRecords: logsWithRecords.length - missingRecords,
		validationErrors
	};
}
