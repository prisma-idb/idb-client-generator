import { z, type ZodTypeAny } from 'zod';
import type { OutboxEventRecord, PrismaIDBSchema } from '../client/idb-interface';
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

const validators = {
	User: UserSchema,
	Todo: TodoSchema
} as const;

export interface SyncResult {
	id: string;
	entityKeyPath: Array<string | number>;
	mergedRecord?: any;
	serverVersion?: number;
	error?: string | null;
}

export async function applySyncBatch(
	events: OutboxEventRecord[],
	customValidation?: (event: EventsFor<typeof validators>) => boolean | Promise<boolean>
): Promise<SyncResult[]> {
	{
		const results: SyncResult[] = [];
		for (const event of events) {
			try {
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

							const result = await syncUser(event, validation.data);
							results.push(result);
						}
						break;
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

							const result = await syncTodo(event, validation.data);
							results.push(result);
						}
						break;
					}
					default:
						throw new Error(`No sync handler for ${event.entityType}`);
				}
			} catch (err) {
				const errorMessage = err instanceof Error ? err.message : 'Unknown error';
				results.push({ id: event.id, error: errorMessage, entityKeyPath: event.entityKeyPath });
			}
		}
		return results;
	}
}

async function syncUser(
	event: OutboxEventRecord,
	data: z.infer<typeof validators.User>
): Promise<SyncResult> {
	const { id, entityKeyPath, operation } = event;
	const keyPathValidation = z.safeParse(z.tuple([z.string()]), entityKeyPath);
	if (!keyPathValidation.success) {
		throw new Error('Invalid entityKeyPath for User');
	}

	const validKeyPath = keyPathValidation.data;

	switch (operation) {
		case 'create': {
			const result = await prisma.user.create({ data });
			return { id, entityKeyPath: [result.id], mergedRecord: result };
		}

		case 'update': {
			if (!entityKeyPath) throw new Error('Missing entityKeyPath for update');
			const result = await prisma.user.update({
				where: { id: validKeyPath[0] },
				data
			});
			return { id, entityKeyPath: [result.id], mergedRecord: result };
		}

		case 'delete': {
			if (!entityKeyPath) throw new Error('Missing entityKeyPath for delete');
			await prisma.user.delete({
				where: { id: validKeyPath[0] }
			});
			return { id, entityKeyPath };
		}

		default:
			throw new Error(`Unknown operation: ${operation}`);
	}
}

async function syncTodo(
	event: OutboxEventRecord,
	data: z.infer<typeof validators.Todo>
): Promise<SyncResult> {
	const { id, entityKeyPath, operation } = event;
	const keyPathValidation = z.safeParse(z.tuple([z.string()]), entityKeyPath);
	if (!keyPathValidation.success) {
		throw new Error('Invalid entityKeyPath for Todo');
	}

	const validKeyPath = keyPathValidation.data;

	switch (operation) {
		case 'create': {
			const result = await prisma.todo.create({ data });
			return { id, entityKeyPath: [result.id], mergedRecord: result };
		}

		case 'update': {
			if (!entityKeyPath) throw new Error('Missing entityKeyPath for update');
			const result = await prisma.todo.update({
				where: { id: validKeyPath[0] },
				data
			});
			return { id, entityKeyPath: [result.id], mergedRecord: result };
		}

		case 'delete': {
			if (!entityKeyPath) throw new Error('Missing entityKeyPath for delete');
			await prisma.todo.delete({
				where: { id: validKeyPath[0] }
			});
			return { id, entityKeyPath };
		}

		default:
			throw new Error(`Unknown operation: ${operation}`);
	}
}
