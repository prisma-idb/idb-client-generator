import type { BenchmarkClient } from "./client";
import type { BenchmarkOperationId } from "./types";

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
