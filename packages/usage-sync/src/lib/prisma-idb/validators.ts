import { z } from 'zod';

export const validators = {
	User: z.strictObject({
		id: z.string(),
		name: z.string()
	}),
	Todo: z.strictObject({
		id: z.string(),
		title: z.string(),
		completed: z.boolean(),
		userId: z.string()
	})
} as const;

export const keyPathValidators = {
	User: z.tuple([z.string()]),
	Todo: z.tuple([z.string()])
} as const;
