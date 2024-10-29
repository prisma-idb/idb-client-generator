import { openDB } from "idb";
import type { IDBPDatabase } from "idb";
import type { Prisma } from "@prisma/client";
import { filterByWhereClause } from "./utils";

const IDB_VERSION: number = 1;

export class PrismaIDBClient {
  private static instance: PrismaIDBClient;
  db!: IDBPDatabase;
  user!: IDBUser;
  todo!: IDBTodo;

  private constructor() {}

  public static async create(): Promise<PrismaIDBClient> {
    if (!PrismaIDBClient.instance) {
      const client = (PrismaIDBClient.instance = new PrismaIDBClient());
      await client.initialize();
      PrismaIDBClient.instance = client;
    }
    return PrismaIDBClient.instance;
  }

  private async initialize() {
    this.db = await openDB("prisma-idb", IDB_VERSION, {
      upgrade(db) {
        db.createObjectStore("user", { keyPath: ["name"] });
        db.createObjectStore("todo", { keyPath: ["id"] });
      },
    });
    this.user = new IDBUser(this, ["name"]);
    this.todo = new IDBTodo(this, ["id"]);
  }
}

class BaseIDBModelClass {
  client: PrismaIDBClient;
  keyPath: string[];

  constructor(client: PrismaIDBClient, keyPath: string[]) {
    this.client = client;
    this.keyPath = keyPath;
  }
}

class IDBUser extends BaseIDBModelClass {
  async findFirst<T extends Prisma.UserFindFirstArgs>(
    query: T,
  ): Promise<Prisma.UserGetPayload<T> | null> {
    return (await this.findMany(query))[0] ?? null;
  }

  async findMany<T extends Prisma.UserFindManyArgs>(
    query: T,
  ): Promise<Prisma.UserGetPayload<T>[]> {
    let records = await this.client.db.getAll("user");
    return filterByWhereClause(
      records,
      this.keyPath,
      query.where,
    ) as Prisma.UserGetPayload<T>[];
  }

  async findUnique<T extends Prisma.UserFindUniqueArgs>(
    query: T,
  ): Promise<Prisma.UserGetPayload<T> | null> {
    if (query.where.name) {
      return (await this.client.db.get("user", [query.where.name])) ?? null;
    }
    throw new Error("No unique field provided in the where clause");
  }

  async create(query: Prisma.UserCreateArgs) {
    await this.client.db.add("user", query.data);
  }

  async createMany(query: Prisma.UserCreateManyArgs) {
    const tx = this.client.db.transaction("user", "readwrite");
    const queryData = Array.isArray(query.data) ? query.data : [query.data];
    await Promise.all([
      ...queryData.map((record) => tx.store.add(record)),
      tx.done,
    ]);
  }

  async delete(query: Prisma.UserDeleteArgs) {
    const records = filterByWhereClause(
      await this.client.db.getAll("user"),
      this.keyPath,
      query.where,
    );
    if (records.length === 0) return;

    await this.client.db.delete(
      "user",
      this.keyPath.map((keyField) => records[0][keyField] as IDBValidKey),
    );
  }

  async deleteMany(query: Prisma.UserDeleteManyArgs) {
    const records = filterByWhereClause(
      await this.client.db.getAll("user"),
      this.keyPath,
      query.where,
    );
    if (records.length === 0) return;

    const tx = this.client.db.transaction("user", "readwrite");
    await Promise.all([
      ...records.map((record) =>
        tx.store.delete(
          this.keyPath.map((keyField) => record[keyField] as IDBValidKey),
        ),
      ),
      tx.done,
    ]);
  }
}

class IDBTodo extends BaseIDBModelClass {
  async findFirst<T extends Prisma.TodoFindFirstArgs>(
    query: T,
  ): Promise<Prisma.TodoGetPayload<T> | null> {
    return (await this.findMany(query))[0] ?? null;
  }

  async findMany<T extends Prisma.TodoFindManyArgs>(
    query: T,
  ): Promise<Prisma.TodoGetPayload<T>[]> {
    let records = await this.client.db.getAll("todo");
    return filterByWhereClause(
      records,
      this.keyPath,
      query.where,
    ) as Prisma.TodoGetPayload<T>[];
  }

  async findUnique<T extends Prisma.TodoFindUniqueArgs>(
    query: T,
  ): Promise<Prisma.TodoGetPayload<T> | null> {
    if (query.where.id) {
      return (await this.client.db.get("todo", [query.where.id])) ?? null;
    }
    throw new Error("No unique field provided in the where clause");
  }

  async create(query: Prisma.TodoCreateArgs) {
    await this.client.db.add("todo", query.data);
  }

  async createMany(query: Prisma.TodoCreateManyArgs) {
    const tx = this.client.db.transaction("todo", "readwrite");
    const queryData = Array.isArray(query.data) ? query.data : [query.data];
    await Promise.all([
      ...queryData.map((record) => tx.store.add(record)),
      tx.done,
    ]);
  }

  async delete(query: Prisma.TodoDeleteArgs) {
    const records = filterByWhereClause(
      await this.client.db.getAll("todo"),
      this.keyPath,
      query.where,
    );
    if (records.length === 0) return;

    await this.client.db.delete(
      "todo",
      this.keyPath.map((keyField) => records[0][keyField] as IDBValidKey),
    );
  }

  async deleteMany(query: Prisma.TodoDeleteManyArgs) {
    const records = filterByWhereClause(
      await this.client.db.getAll("todo"),
      this.keyPath,
      query.where,
    );
    if (records.length === 0) return;

    const tx = this.client.db.transaction("todo", "readwrite");
    await Promise.all([
      ...records.map((record) =>
        tx.store.delete(
          this.keyPath.map((keyField) => record[keyField] as IDBValidKey),
        ),
      ),
      tx.done,
    ]);
  }
}
