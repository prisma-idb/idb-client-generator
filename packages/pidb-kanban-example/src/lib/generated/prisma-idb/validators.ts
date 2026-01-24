import { z } from 'zod';

export const validators = {
	Board: z.strictObject({
		id: z.string(),
		name: z.string(),
		createdAt: z.date(),
		userId: z.string()
	}),
	Todo: z.strictObject({
		id: z.string(),
		title: z.string(),
		description: z.string().nullable(),
		isCompleted: z.boolean(),
		createdAt: z.date(),
		boardId: z.string()
	}),
	User: z.strictObject({
		id: z.string(),
		name: z.string(),
		email: z.string(),
		emailVerified: z.boolean(),
		image: z.string().nullable(),
		createdAt: z.date(),
		updatedAt: z.date()
	})
} as const;

export const keyPathValidators = {
	Board: z.tuple([z.string()]),
	Todo: z.tuple([z.string()]),
	User: z.tuple([z.string()])
} as const;
