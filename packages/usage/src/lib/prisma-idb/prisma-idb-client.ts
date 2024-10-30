import { openDB } from "idb";
import type { IDBPDatabase } from "idb";
import type { Prisma } from "@prisma/client";
import { filterByWhereClause } from "./utils";
import { v4 as uuidv4 } from "uuid";

const IDB_VERSION: number = 1;

export class PrismaIDBClient {
  private static instance: PrismaIDBClient;
  db!: IDBPDatabase;

  private constructor() {}

  todo!: IDBTodo;

  public static async create(): Promise<PrismaIDBClient> {
    if (!PrismaIDBClient.instance) {
      const client = new PrismaIDBClient();
      await client.initialize();
      PrismaIDBClient.instance = client;
    }
    return PrismaIDBClient.instance;
  }

  private async initialize() {
    this.db = await openDB("prisma-idb", IDB_VERSION, {
      upgrade(db) {
        db.createObjectStore("todo", { keyPath: ["id"] });
      },
    });
    this.todo = new IDBTodo(this, ["id"]);
  }
}

class BaseIDBModelClass {
  client: PrismaIDBClient;
  keyPath: string[];
  private eventEmitter: EventTarget;

  constructor(client: PrismaIDBClient, keyPath: string[]) {
    this.client = client;
    this.keyPath = keyPath;
    this.eventEmitter = new EventTarget();
  }

  subscribe(event: "create" | "update" | "delete" | ("create" | "update" | "delete")[], callback: () => void) {
    if (Array.isArray(event)) {
      event.forEach((event) => this.eventEmitter.addEventListener(event, callback));
      return;
    }
    this.eventEmitter.addEventListener(event, callback);
  }

  unsubscribe(event: "create" | "update" | "delete" | ("create" | "update" | "delete")[], callback: () => void) {
    if (Array.isArray(event)) {
      event.forEach((event) => this.eventEmitter.removeEventListener(event, callback));
      return;
    }
    this.eventEmitter.removeEventListener(event, callback);
  }

  emit(event: "create" | "update" | "delete") {
    this.eventEmitter.dispatchEvent(new Event(event));
  }
}

class IDBTodo extends BaseIDBModelClass {
  async fillDefaults(data: Prisma.XOR<Prisma.TodoCreateInput, Prisma.TodoUncheckedCreateInput>) {
    if (data.id === undefined) {
      data.id = uuidv4();
    }
    return data;
  }

  async findMany<T extends Prisma.TodoFindManyArgs>(query?: T): Promise<Prisma.TodoGetPayload<T>[]> {
    const records = await this.client.db.getAll("todo");
    return filterByWhereClause(records, this.keyPath, query?.where) as Prisma.TodoGetPayload<T>[];
  }

  async findFirst<T extends Prisma.TodoFindFirstArgs>(query?: T): Promise<Prisma.TodoGetPayload<T> | null> {
    return (await this.findMany(query))[0] ?? null;
  }

  async findUnique<T extends Prisma.TodoFindUniqueArgs>(query: T): Promise<Prisma.TodoGetPayload<T> | null> {
    if (query.where.id) {
      return (await this.client.db.get("todo", [query.where.id])) ?? null;
    }
    throw new Error("No unique field provided in the where clause");
  }

  async create(query: Prisma.TodoCreateArgs) {
    await this.client.db.add("todo", await this.fillDefaults(query.data));
    this.emit("create");
  }

  async createMany(query: Prisma.TodoCreateManyArgs) {
    const tx = this.client.db.transaction("todo", "readwrite");
    const queryData = Array.isArray(query.data) ? query.data : [query.data];
    await Promise.all([...queryData.map(async (record) => tx.store.add(await this.fillDefaults(record))), tx.done]);
    this.emit("create");
  }

  async delete(query: Prisma.TodoDeleteArgs) {
    const records = filterByWhereClause(await this.client.db.getAll("todo"), this.keyPath, query.where);
    if (records.length === 0) return;

    await this.client.db.delete(
      "todo",
      this.keyPath.map((keyField) => records[0][keyField] as IDBValidKey),
    );
    this.emit("delete");
  }

  async deleteMany(query?: Prisma.TodoDeleteManyArgs) {
    const records = filterByWhereClause(await this.client.db.getAll("todo"), this.keyPath, query?.where);
    if (records.length === 0) return;

    const tx = this.client.db.transaction("todo", "readwrite");
    await Promise.all([
      ...records.map((record) => tx.store.delete(this.keyPath.map((keyField) => record[keyField] as IDBValidKey))),
      tx.done,
    ]);
    this.emit("delete");
  }

  async update<T extends Prisma.TodoUpdateArgs>(query: T): Promise<Prisma.TodoGetPayload<T> | null> {
    const record = await this.findFirst(query);
    if (record === null) return null;
    if (query.data.id !== undefined) {
      if (typeof query.data.id === "string") {
        record.id = query.data.id;
      } else {
        throw new Error("Indirect updates not yet supported");
      }
    }
    if (query.data.task !== undefined) {
      if (typeof query.data.task === "string") {
        record.task = query.data.task;
      } else {
        throw new Error("Indirect updates not yet supported");
      }
    }
    if (query.data.isCompleted !== undefined) {
      if (typeof query.data.isCompleted === "boolean") {
        record.isCompleted = query.data.isCompleted;
      } else {
        throw new Error("Indirect updates not yet supported");
      }
    }
    await this.client.db.put("todo", record);
    this.emit("update");
    return record;
  }
}
