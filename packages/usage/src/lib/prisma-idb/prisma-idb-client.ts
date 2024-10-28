import { openDB } from "idb";
import type { IDBPDatabase } from "idb";
import type { Prisma } from "@prisma/client";
import { filterByWhereClause } from "./utils";

const IDB_VERSION: number = 1;

export class PrismaIDBClient {
  private static instance: PrismaIDBClient;
  db!: IDBPDatabase;
  todo!: IDBTodo;

  private constructor() {}

  static async getInstance(): Promise<PrismaIDBClient> {
    if (!PrismaIDBClient.instance) {
      PrismaIDBClient.instance = new PrismaIDBClient();
      await PrismaIDBClient.instance.createDatabase();
    }
    return PrismaIDBClient.instance;
  }

  protected async createDatabase() {
    this.db = await openDB("prisma-idb", IDB_VERSION, {
      upgrade(db) {
        db.createObjectStore("todo", { keyPath: ["id"] });
      },
    });
    this.todo = new IDBTodo(this.db, ["id"]);
  }
}

class BaseIDBModelClass {
  db: IDBPDatabase;
  keyPath: string[];

  constructor(db: IDBPDatabase, keyPath: string[]) {
    this.db = db;
    this.keyPath = keyPath;
  }
}

class IDBTodo extends BaseIDBModelClass {
  async findFirst<T extends Prisma.TodoFindFirstArgs>(query: T): Promise<Prisma.TodoGetPayload<T> | null> {
    const records = filterByWhereClause(
      await this.db.getAll("todo"),
      this.keyPath,
      query.where,
    ) as Prisma.TodoGetPayload<T>[];
    return records[0] ?? null;
  }

  async findMany<T extends Prisma.TodoFindManyArgs>(query: T): Promise<Prisma.TodoGetPayload<T>[]> {
    return await this.db.getAll("todo");
  }

  async findUnique<T extends Prisma.TodoFindUniqueArgs>(query: T): Promise<Prisma.TodoGetPayload<T> | null> {
    if (query.where.id) {
      return (await this.db.get("todo", [query.where.id])) ?? null;
    }
    throw new Error("No unique field provided in the where clause");
  }

  async create(query: Prisma.TodoCreateArgs) {
    await this.db.add("todo", query.data);
  }

  async createMany(query: Prisma.TodoCreateManyArgs) {
    const tx = this.db.transaction("todo", "readwrite");
    const queryData = Array.isArray(query.data) ? query.data : [query.data];
    await Promise.all([...queryData.map((record) => tx.store.add(record)), tx.done]);
  }

  async delete(query: Prisma.TodoDeleteArgs) {}

  async deleteMany(query: Prisma.TodoDeleteManyArgs) {}
}
