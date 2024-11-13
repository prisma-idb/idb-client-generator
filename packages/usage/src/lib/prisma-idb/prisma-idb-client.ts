import type { IDBPDatabase } from "idb";
import { openDB } from "idb";
import type { PrismaIDBSchema } from "./idb-interface";

const IDB_VERSION = 1;

export class PrismaIDBClient {
  private static instance: PrismaIDBClient;
  db!: IDBPDatabase<PrismaIDBSchema>;

  private constructor() {}

  user!: UserIDBClass;
  todo!: TodoIDBClass;

  public static async create(): Promise<PrismaIDBClient> {
    if (!PrismaIDBClient.instance) {
      const client = new PrismaIDBClient();
      await client.initialize();
      PrismaIDBClient.instance = client;
    }
    return PrismaIDBClient.instance;
  }

  private async initialize() {
    this.db = await openDB<PrismaIDBSchema>("prisma-idb", IDB_VERSION, {
      upgrade(db) {
        db.createObjectStore("User", { keyPath: ["id"] });
        db.createObjectStore("Todo", { keyPath: ["id"] });
      },
    });
    this.user = new UserIDBClass(this, ["id"]);
    this.todo = new TodoIDBClass(this, ["id"]);
  }
}
