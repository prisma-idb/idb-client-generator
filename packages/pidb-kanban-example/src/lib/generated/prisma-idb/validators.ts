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
	}),
	Session: z.strictObject({
		id: z.string(),
		expiresAt: z.date(),
		token: z.string(),
		createdAt: z.date(),
		updatedAt: z.date(),
		ipAddress: z.string().nullable(),
		userAgent: z.string().nullable(),
		userId: z.string()
	}),
	Account: z.strictObject({
		id: z.string(),
		accountId: z.string(),
		providerId: z.string(),
		userId: z.string(),
		accessToken: z.string().nullable(),
		refreshToken: z.string().nullable(),
		idToken: z.string().nullable(),
		accessTokenExpiresAt: z.date().nullable(),
		refreshTokenExpiresAt: z.date().nullable(),
		scope: z.string().nullable(),
		password: z.string().nullable(),
		createdAt: z.date(),
		updatedAt: z.date()
	}),
	Verification: z.strictObject({
		id: z.string(),
		identifier: z.string(),
		value: z.string(),
		expiresAt: z.date(),
		createdAt: z.date(),
		updatedAt: z.date()
	})
} as const;

export const keyPathValidators = {
	Board: z.tuple([z.string()]),
	Todo: z.tuple([z.string()]),
	User: z.tuple([z.string()]),
	Session: z.tuple([z.string()]),
	Account: z.tuple([z.string()]),
	Verification: z.tuple([z.string()])
} as const;
