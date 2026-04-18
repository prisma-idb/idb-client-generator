import type { PrismaIDBClient } from "../prisma-idb/client/prisma-idb-client";

type PrismaIDBClientInstance = Awaited<ReturnType<typeof PrismaIDBClient.createClient>>;

export type BenchmarkClient = Pick<PrismaIDBClientInstance, "resetDatabase" | "user" | "todo">;

export async function createBenchmarkClient(): Promise<BenchmarkClient> {
  const module = await import("../prisma-idb/client/prisma-idb-client");
  return module.PrismaIDBClient.createClient();
}
