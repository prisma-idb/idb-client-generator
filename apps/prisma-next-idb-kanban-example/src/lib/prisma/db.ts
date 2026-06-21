import { createAutoMigratingIdbClient } from "@prisma-next-idb/client-idb/client-auto";
import type { IdbClient } from "@prisma-next-idb/client-idb/client-auto";
import type { Contract } from "./contract";
import { contractSpace } from "./contract-space.generated";

const DB_NAME = "prisma-next-idb-kanban-example";

type DbClient = IdbClient<Contract>;

let client: DbClient | null = null;
let clientPromise: Promise<DbClient> | null = null;

export async function getDb(): Promise<DbClient> {
  if (client) return client;
  if (!clientPromise) {
    clientPromise = createAutoMigratingIdbClient({
      contractSpace,
      dbName: DB_NAME,
    });
  }

  const fresh = await clientPromise;
  client = fresh;

  return fresh;
}

export async function closeDb(): Promise<void> {
  if (!client) return;
  await client.close();
  client = null;
  clientPromise = null;
}
