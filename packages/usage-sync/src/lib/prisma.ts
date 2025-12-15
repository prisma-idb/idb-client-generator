import { Prisma, PrismaClient } from '$lib/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const createPrismaClient = () => {
	return new PrismaClient({
		adapter: new PrismaPg({
			connectionString: process.env.DATABASE_URL
		}),
		log: [{ emit: 'event', level: 'query' }]
	});
};

type PrismaClientWithEvents = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma: PrismaClientWithEvents | undefined };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

prisma.$on('query', (e: Prisma.QueryEvent) => {
	console.log('Query: ' + e.query);
	console.log('Params: ' + e.params);
	console.log('Duration: ' + e.duration + 'ms');
});
