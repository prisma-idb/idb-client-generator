import type { PrismaIDBClient } from "../prisma-idb/client/prisma-idb-client";
import type { BenchmarkOperationId } from "./types";

type PrismaIDBClientInstance = Awaited<ReturnType<typeof PrismaIDBClient.createClient>>;
export type BenchmarkClient = Pick<PrismaIDBClientInstance, "resetDatabase" | "user" | "todo">;

export interface BenchmarkOperationDefinition {
  operationId: BenchmarkOperationId;
  label: string;
  prepare: (client: BenchmarkClient, datasetSize: number) => Promise<void>;
  run: (client: BenchmarkClient, datasetSize: number) => Promise<void>;
}

async function seedTodos(client: BenchmarkClient, datasetSize: number) {
  const user = await client.user.create({ data: { name: "Seed User" } });
  const rows = Array.from({ length: datasetSize }, (_, index) => ({
    title: `Task ${index}`,
    completed: index % 2 === 0,
    userId: user.id,
  }));

  await client.todo.createMany({ data: rows });
}

export const operationDefinitions: BenchmarkOperationDefinition[] = [
  {
    operationId: "create-user",
    label: "Create user",
    prepare: async (client) => {
      await client.resetDatabase();
    },
    run: async (client) => {
      await client.user.create({ data: { name: `Bench User ${crypto.randomUUID()}` } });
    },
  },
  {
    operationId: "create-many-todos",
    label: "Create many todos",
    prepare: async (client) => {
      await client.resetDatabase();
      await seedTodos(client, 5);
    },
    run: async (client, datasetSize) => {
      const user = await client.user.create({ data: { name: "Batch Target" } });
      const rows = Array.from({ length: datasetSize }, (_, index) => ({
        title: `Batch Task ${index}`,
        completed: false,
        userId: user.id,
      }));
      await client.todo.createMany({ data: rows });
    },
  },
  {
    operationId: "find-many-completed",
    label: "Find many completed",
    prepare: async (client, datasetSize) => {
      await client.resetDatabase();
      await seedTodos(client, datasetSize);
    },
    run: async (client) => {
      await client.todo.findMany({ where: { completed: true } });
    },
  },
  {
    operationId: "find-many-completed-sorted",
    label: "Find many completed (sorted)",
    prepare: async (client, datasetSize) => {
      await client.resetDatabase();
      await seedTodos(client, datasetSize);
    },
    run: async (client) => {
      await client.todo.findMany({ where: { completed: true }, orderBy: { title: "asc" } });
    },
  },
  {
    operationId: "find-many-completed-paginated",
    label: "Find many completed (paginated)",
    prepare: async (client, datasetSize) => {
      await client.resetDatabase();
      await seedTodos(client, datasetSize);
    },
    run: async (client, datasetSize) => {
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
      await seedTodos(client, datasetSize);
    },
    run: async (client, datasetSize) => {
      const take = Math.max(50, Math.floor(datasetSize * 0.25));
      await client.todo.findMany({ where: { completed: true }, include: { user: true }, take });
    },
  },
  {
    operationId: "update-many-completed",
    label: "Update many completed",
    prepare: async (client, datasetSize) => {
      await client.resetDatabase();
      await seedTodos(client, datasetSize);
    },
    run: async (client) => {
      await client.todo.updateMany({ where: { completed: false }, data: { completed: true } });
    },
  },
  {
    operationId: "delete-many-completed",
    label: "Delete many completed",
    prepare: async (client, datasetSize) => {
      await client.resetDatabase();
      await seedTodos(client, datasetSize);
    },
    run: async (client) => {
      await client.todo.deleteMany({ where: { completed: true } });
    },
  },
  {
    operationId: "find-many-title-contains",
    label: "Find many title contains",
    prepare: async (client, datasetSize) => {
      await client.resetDatabase();
      await seedTodos(client, datasetSize);
    },
    run: async (client) => {
      await client.todo.findMany({ where: { title: { contains: "Task 1" } } });
    },
  },
];
