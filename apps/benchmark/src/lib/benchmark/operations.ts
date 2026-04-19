import type { PrismaIDBClient } from "../prisma-idb/client/prisma-idb-client";
import type { BenchmarkOperationId } from "./types";

type PrismaIDBClientInstance = Awaited<ReturnType<typeof PrismaIDBClient.createClient>>;
export type BenchmarkClient = Pick<PrismaIDBClientInstance, "resetDatabase" | "user" | "todo">;

export interface OperationContext {
  user?: { id: number };
  rows?: Array<{ title: string; completed: boolean; userId: number }>;
}

export interface BenchmarkOperationDefinition {
  operationId: BenchmarkOperationId;
  label: string;
  prepare: (client: BenchmarkClient, datasetSize: number) => Promise<OperationContext>;
  run: (client: BenchmarkClient, datasetSize: number, context?: OperationContext) => Promise<void>;
}

async function seedTodos(client: BenchmarkClient, datasetSize: number): Promise<OperationContext> {
  const user = await client.user.create({ data: { name: "Seed User" } });
  const rows = Array.from({ length: datasetSize }, (_, index) => ({
    title: `Task ${index}`,
    completed: index % 2 === 0,
    userId: user.id,
  }));

  await client.todo.createMany({ data: rows });
  return { user, rows };
}

export const operationDefinitions: BenchmarkOperationDefinition[] = [
  {
    operationId: "create-user",
    label: "Create user",
    prepare: async (client) => {
      await client.resetDatabase();
      return {};
    },
    run: async (client, _datasetSize, _context) => {
      await client.user.create({ data: { name: `Bench User ${crypto.randomUUID()}` } });
    },
  },
  {
    operationId: "create-many-todos",
    label: "Create many todos",
    prepare: async (client, datasetSize) => {
      await client.resetDatabase();
      await seedTodos(client, 5);
      const user = await client.user.create({ data: { name: "Batch Target" } });
      const rows = Array.from({ length: datasetSize }, (_, index) => ({
        title: `Batch Task ${index}`,
        completed: false,
        userId: user.id,
      }));
      return { user, rows };
    },
    run: async (client, _datasetSize, context) => {
      if (!context?.rows) throw new Error("prepare must set rows for create-many-todos");
      await client.todo.createMany({ data: context.rows });
    },
  },
  {
    operationId: "find-many-completed",
    label: "Find many completed",
    prepare: async (client, datasetSize) => {
      await client.resetDatabase();
      return seedTodos(client, datasetSize);
    },
    run: async (client, _datasetSize, _context) => {
      await client.todo.findMany({ where: { completed: true } });
    },
  },
  {
    operationId: "find-many-completed-sorted",
    label: "Find many completed (sorted)",
    prepare: async (client, datasetSize) => {
      await client.resetDatabase();
      return seedTodos(client, datasetSize);
    },
    run: async (client, _datasetSize, _context) => {
      await client.todo.findMany({ where: { completed: true }, orderBy: { title: "asc" } });
    },
  },
  {
    operationId: "find-many-completed-paginated",
    label: "Find many completed (paginated)",
    prepare: async (client, datasetSize) => {
      await client.resetDatabase();
      return seedTodos(client, datasetSize);
    },
    run: async (client, datasetSize, _context) => {
      const skip = Math.max(0, Math.floor(datasetSize * 0.2));
      const take = Math.max(20, Math.floor(datasetSize * 0.3));

      await client.todo.findMany({
        where: { completed: true },
        orderBy: { title: "asc" },
        skip,
        take,
      });
    },
  },
  {
    operationId: "find-many-with-user-include",
    label: "Find many with user include",
    prepare: async (client, datasetSize) => {
      await client.resetDatabase();
      return seedTodos(client, datasetSize);
    },
    run: async (client, datasetSize, _context) => {
      const take = Math.max(50, Math.floor(datasetSize * 0.25));
      await client.todo.findMany({ where: { completed: true }, include: { user: true }, take });
    },
  },
  {
    operationId: "update-many-completed",
    label: "Update many completed",
    prepare: async (client, datasetSize) => {
      await client.resetDatabase();
      return seedTodos(client, datasetSize);
    },
    run: async (client, _datasetSize, _context) => {
      await client.todo.updateMany({ where: { completed: false }, data: { completed: true } });
    },
  },
  {
    operationId: "delete-many-completed",
    label: "Delete many completed",
    prepare: async (client, datasetSize) => {
      await client.resetDatabase();
      return seedTodos(client, datasetSize);
    },
    run: async (client, _datasetSize, _context) => {
      await client.todo.deleteMany({ where: { completed: true } });
    },
  },
  {
    operationId: "find-many-title-contains",
    label: "Find many title contains",
    prepare: async (client, datasetSize) => {
      await client.resetDatabase();
      return seedTodos(client, datasetSize);
    },
    run: async (client, _datasetSize, _context) => {
      await client.todo.findMany({ where: { title: { contains: "Task 1" } } });
    },
  },
];
