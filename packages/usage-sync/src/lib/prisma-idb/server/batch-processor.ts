import { z, type ZodTypeAny } from 'zod';
import type { OutboxEventRecord, PrismaIDBSchema } from '../client/idb-interface';
import type { ChangeLog } from '$lib/generated/prisma/client';
import { prisma } from '$lib/prisma';
import { UserSchema, TodoSchema } from '$lib/generated/prisma-zod-generator/schemas/models';

type Op = 'create' | 'update' | 'delete';

type EventsFor<V extends Partial<Record<string, ZodTypeAny>>> = {
	[M in keyof V & string]: {
		[O in Op]: {
			entityType: M;
			operation: O;
			payload: z.infer<V[M]>;
		};
	}[Op];
}[keyof V & string];

export type LogsWithRecords<V extends Partial<Record<string, ZodTypeAny>>> = {
	[M in keyof V & string]: Omit<ChangeLog, 'model' | 'keyPath'> & {
		model: M;
		keyPath: Array<string | number>;
		record?: z.infer<V[M]> | null;
	};
}[keyof V & string];

const validators = {
	User: UserSchema,
	Todo: TodoSchema
} as const;

export interface SyncResult {
	id: string;
	oldKeyPath?: Array<string | number>;
	entityKeyPath: Array<string | number>;
	mergedRecord?: any;
	serverVersion?: number;
	error?: string | null;
}

export async function applySyncBatch(
	events: OutboxEventRecord[],
	scopeKey: string | ((event: OutboxEventRecord) => string),
	customValidation?: (event: EventsFor<typeof validators>) => boolean | Promise<boolean>
): Promise<SyncResult[]> {
	{
		const results: SyncResult[] = [];
		for (const event of events) {
			try {
				const resolvedScopeKey = typeof scopeKey === 'function' ? scopeKey(event) : scopeKey;
				let result: SyncResult;
				switch (event.entityType) {
					case 'User': {
						{
							const validation = validators.User.safeParse(event.payload);
							if (!validation.success)
								throw new Error(`Validation failed: ${validation.error.message}`);

							if (customValidation) {
								const ok = await customValidation(event as EventsFor<typeof validators>);
								if (!ok) throw new Error('custom validation failed');
							}

							result = await syncUser(event, validation.data, resolvedScopeKey);
							break;
						}
					}
					case 'Todo': {
						{
							const validation = validators.Todo.safeParse(event.payload);
							if (!validation.success)
								throw new Error(`Validation failed: ${validation.error.message}`);

							if (customValidation) {
								const ok = await customValidation(event as EventsFor<typeof validators>);
								if (!ok) throw new Error('custom validation failed');
							}

							result = await syncTodo(event, validation.data, resolvedScopeKey);
							break;
						}
					}
					default:
						throw new Error(`No sync handler for ${event.entityType}`);
				}
				results.push(result);
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : 'Unknown error';
				results.push({ id: event.id, error: errorMessage, entityKeyPath: event.entityKeyPath });
			}
		}
		return results;
	}
}

export async function attachRecordsToLogs(
	logs: Array<ChangeLog>
): Promise<Array<LogsWithRecords<typeof validators>>> {
	{
		const validModelNames = ['User', 'Todo'];
		const results: Array<LogsWithRecords<typeof validators>> = [];
		for (const log of logs) {
			if (!validModelNames.includes(log.model)) {
				throw new Error(`Unknown model: ${log.model}`);
			}
			try {
				switch (log.model) {
					case 'User': {
						const keyPathValidation = z.safeParse(z.tuple([z.string()]), log.keyPath);
						if (!keyPathValidation.success) {
							throw new Error('Invalid keyPath for User');
						}
						const validKeyPath = keyPathValidation.data;
						const record = await prisma.user.findUnique({
							where: { id: validKeyPath[0] }
						});
						results.push({ ...log, model: 'User', keyPath: validKeyPath, record });
						break;
					}
					case 'Todo': {
						const keyPathValidation = z.safeParse(z.tuple([z.string()]), log.keyPath);
						if (!keyPathValidation.success) {
							throw new Error('Invalid keyPath for Todo');
						}
						const validKeyPath = keyPathValidation.data;
						const record = await prisma.todo.findUnique({
							where: { id: validKeyPath[0] }
						});
						results.push({ ...log, model: 'Todo', keyPath: validKeyPath, record });
						break;
					}
				}
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : 'Unknown error';
				console.error(`Failed to fetch record for ${log.model}:`, errorMessage);
			}
		}
		return results;
	}
}

async function syncUser(
	event: OutboxEventRecord,
	data: z.infer<typeof validators.User>,
	scopeKey: string
): Promise<SyncResult> {
	const { id, entityKeyPath, operation } = event;
	const keyPathValidation = z.safeParse(z.tuple([z.string()]), entityKeyPath);
	if (!keyPathValidation.success) {
		throw new Error('Invalid entityKeyPath for User');
	}

	const validKeyPath = keyPathValidation.data;

	switch (operation) {
		case 'create': {
			const [result] = await prisma.$transaction([
				prisma.user.create({ data }),
				prisma.changeLog.create({
					data: {
						model: 'User',
						keyPath: validKeyPath,
						operation: 'create',
						scopeKey
					}
				})
			]);
			const newKeyPath = [result.id];
			return { id, entityKeyPath: newKeyPath, mergedRecord: result };
		}

		case 'update': {
			if (!entityKeyPath) throw new Error('Missing entityKeyPath for update');
			const oldKeyPath = [...validKeyPath];
			const [result] = await prisma.$transaction([
				prisma.user.update({
					where: { id: validKeyPath[0] },
					data
				}),
				prisma.changeLog.create({
					data: {
						model: 'User',
						keyPath: validKeyPath,
						oldKeyPath,
						operation: 'update',
						scopeKey
					}
				})
			]);
			const newKeyPath = [result.id];
			return { id, oldKeyPath, entityKeyPath: newKeyPath, mergedRecord: result };
		}

		case 'delete': {
			if (!entityKeyPath) throw new Error('Missing entityKeyPath for delete');
			await prisma.$transaction([
				prisma.user.delete({
					where: { id: validKeyPath[0] }
				}),
				prisma.changeLog.create({
					data: {
						model: 'User',
						keyPath: validKeyPath,
						operation: 'delete',
						scopeKey
					}
				})
			]);
			return { id, entityKeyPath: validKeyPath };
		}

		default:
			throw new Error(`Unknown operation: ${operation}`);
	}
}

async function syncTodo(
	event: OutboxEventRecord,
	data: z.infer<typeof validators.Todo>,
	scopeKey: string
): Promise<SyncResult> {
	const { id, entityKeyPath, operation } = event;
	const keyPathValidation = z.safeParse(z.tuple([z.string()]), entityKeyPath);
	if (!keyPathValidation.success) {
		throw new Error('Invalid entityKeyPath for Todo');
	}

	const validKeyPath = keyPathValidation.data;

	switch (operation) {
		case 'create': {
			const [result] = await prisma.$transaction([
				prisma.todo.create({ data }),
				prisma.changeLog.create({
					data: {
						model: 'Todo',
						keyPath: validKeyPath,
						operation: 'create',
						scopeKey
					}
				})
			]);
			const newKeyPath = [result.id];
			return { id, entityKeyPath: newKeyPath, mergedRecord: result };
		}

		case 'update': {
			if (!entityKeyPath) throw new Error('Missing entityKeyPath for update');
			const oldKeyPath = [...validKeyPath];
			const [result] = await prisma.$transaction([
				prisma.todo.update({
					where: { id: validKeyPath[0] },
					data
				}),
				prisma.changeLog.create({
					data: {
						model: 'Todo',
						keyPath: validKeyPath,
						oldKeyPath,
						operation: 'update',
						scopeKey
					}
				})
			]);
			const newKeyPath = [result.id];
			return { id, oldKeyPath, entityKeyPath: newKeyPath, mergedRecord: result };
		}

		case 'delete': {
			if (!entityKeyPath) throw new Error('Missing entityKeyPath for delete');
			await prisma.$transaction([
				prisma.todo.delete({
					where: { id: validKeyPath[0] }
				}),
				prisma.changeLog.create({
					data: {
						model: 'Todo',
						keyPath: validKeyPath,
						operation: 'delete',
						scopeKey
					}
				})
			]);
			return { id, entityKeyPath: validKeyPath };
		}

		default:
			throw new Error(`Unknown operation: ${operation}`);
	}
}
