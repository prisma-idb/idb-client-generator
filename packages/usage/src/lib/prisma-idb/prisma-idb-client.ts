import type { Prisma } from "@prisma/client";
import type { IDBPDatabase } from "idb";
import { openDB } from "idb";
import * as models from "./datamodel";
import type { PrismaIDBSchema } from "./idb-interface";
import type { Model } from "./utils";
import { filterByWhereClause, generateIDBKey, getModelFieldData, prismaToJsTypes } from "./utils";

const IDB_VERSION: number = 1;

type ModelDelegate = Prisma.TodoDelegate;
type ObjectStoreName = (typeof PrismaIDBClient.prototype.db.objectStoreNames)[number];

export class PrismaIDBClient {
  private static instance: PrismaIDBClient;
  db!: IDBPDatabase<PrismaIDBSchema>;

  private constructor() {}

  todo!: BaseIDBModelClass<Prisma.TodoDelegate>;

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
        db.createObjectStore("Todo", { keyPath: ["id"] });
      },
    });
    this.todo = new BaseIDBModelClass<Prisma.TodoDelegate>(this, ["id"], models.Todo);
  }
}

class BaseIDBModelClass<T extends ModelDelegate> {
  private client: PrismaIDBClient;
  private keyPath: string[];
  private model: Omit<Model, "name"> & { name: ObjectStoreName };
  private eventEmitter: EventTarget;

  constructor(client: PrismaIDBClient, keyPath: string[], model: Model) {
    this.client = client;
    this.keyPath = keyPath;
    this.model = model as Omit<Model, "name"> & { name: ObjectStoreName };
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

  private emit(event: "create" | "update" | "delete") {
    this.eventEmitter.dispatchEvent(new Event(event));
  }

  private async fillDefaults<D extends Prisma.Args<T, "create">["data"]>(data: D) {
    if (data === undefined) data = {} as D;
    await Promise.all(
      this.model.fields
        .filter(({ hasDefaultValue }) => hasDefaultValue)
        .map(async (field) => {
          const fieldName = field.name as keyof D & string;
          const dataField = data as Record<string, unknown>;
          const defaultValue = field.default!;
          if (dataField[fieldName] === undefined) {
            if (typeof defaultValue === "object" && "name" in defaultValue) {
              if (defaultValue.name === "uuid(4)") {
                dataField[fieldName] = crypto.randomUUID() as (typeof data)[typeof fieldName];
              } else if (defaultValue.name === "cuid") {
                const { createId } = await import("@paralleldrive/cuid2");
                dataField[fieldName] = createId() as (typeof data)[typeof fieldName];
              } else if (defaultValue.name === "autoincrement") {
                const transaction = this.client.db.transaction(this.model.name, "readonly");
                const store = transaction.objectStore(this.model.name);
                const cursor = await store.openCursor(null, "prev");
                dataField[fieldName] = (cursor ? Number(cursor.key) + 1 : 1) as (typeof data)[typeof fieldName];
              }
            } else {
              dataField[fieldName] = defaultValue as (typeof data)[typeof fieldName];
            }
          }
          data = dataField as D;
        }),
    );
    return data;
  }

  async findMany<Q extends Prisma.Args<T, "findMany">>(query?: Q): Promise<Prisma.Result<T, Q, "findMany">> {
    const records = await this.client.db.getAll(`${this.model.name}`);
    return filterByWhereClause(records, this.keyPath, query?.where) as Prisma.Result<T, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<T, "findFirst">>(query?: Q): Promise<Prisma.Result<T, Q, "findFirst"> | null> {
    return ((await this.findMany(query))[0] as Prisma.Result<T, Q, "findFirst"> | undefined) ?? null;
  }

  async findUnique<Q extends Prisma.Args<T, "findUnique">>(
    query: Q,
  ): Promise<Prisma.Result<T, Q, "findUnique"> | null> {
    const queryWhere = query.where as Record<string, unknown>;
    if (this.model.primaryKey) {
      const pk = this.model.primaryKey;
      const keyFieldName = pk.fields.join("_");
      return (
        (filterByWhereClause(
          [await this.client.db.get(this.model.name, Object.values(queryWhere[keyFieldName]!) ?? null)],
          this.keyPath,
          query.where,
        )[0] as Prisma.Result<T, Q, "findUnique">) ?? null
      );
    } else {
      const identifierFieldName = JSON.parse(generateIDBKey(this.model))[0];
      if (queryWhere[identifierFieldName]) {
        return (await this.client.db.get(this.model.name, [queryWhere[identifierFieldName]] as IDBValidKey)) ?? null;
      }
    }
    getModelFieldData(this.model)
      .nonKeyUniqueFields.map(({ name }) => name)
      .forEach(async (uniqueField) => {
        {
          if (!queryWhere[uniqueField]) return;
          return (
            (await this.client.db.getFromIndex(
              this.model.name,
              `${uniqueField}Index`,
              queryWhere[uniqueField] as IDBValidKey,
            )) ?? null
          );
        }
      });
    throw new Error("No unique field provided for findUnique");
  }

  async create<Q extends Prisma.Args<T, "create">>(query: Q): Promise<Prisma.Result<T, Q, "create">> {
    const record = await this.fillDefaults(query.data);
    await this.client.db.add(this.model.name, record);
    this.emit("create");
    return record as Prisma.Result<T, Q, "create">;
  }

  async createMany<Q extends Prisma.Args<T, "createMany">>(query: Q): Promise<Prisma.Result<T, Q, "createMany">> {
    const tx = this.client.db.transaction(this.model.name, "readwrite");
    const queryData = Array.isArray(query.data) ? query.data : [query.data];
    await Promise.all([...queryData.map(async (record) => tx.store.add(await this.fillDefaults(record))), tx.done]);
    this.emit("create");
    return { count: queryData.length } as Prisma.Result<T, Q, "createMany">;
  }

  async delete<Q extends Prisma.Args<T, "delete">>(query: Q): Promise<Prisma.Result<T, Q, "delete">> {
    const records = filterByWhereClause(await this.client.db.getAll(this.model.name), this.keyPath, query.where);
    if (records.length === 0) throw new Error("Record not found");

    await this.client.db.delete(
      this.model.name,
      this.keyPath.map((keyField) => records[0][keyField] as IDBValidKey),
    );
    this.emit("delete");
    return records[0] as Prisma.Result<T, Q, "delete">;
  }

  async deleteMany<Q extends Prisma.Args<T, "deleteMany">>(query: Q) {
    const records = filterByWhereClause(await this.client.db.getAll(this.model.name), this.keyPath, query?.where);
    if (records.length === 0) return { count: 0 } as Prisma.Result<T, Q, "deleteMany">;

    const tx = this.client.db.transaction(this.model.name, "readwrite");
    await Promise.all([
      ...records.map((record) => tx.store.delete(this.keyPath.map((keyField) => record[keyField] as IDBValidKey))),
      tx.done,
    ]);
    this.emit("delete");
    return { count: records.length } as Prisma.Result<T, Q, "deleteMany">;
  }

  async update<Q extends Prisma.Args<T, "update">>(query: Q): Promise<Prisma.Result<T, Q, "update">> {
    const record = (await this.findFirst(query)) as Record<string, unknown>;
    if (record === null) throw new Error("Record not found");
    this.model.fields.forEach((field) => {
      const fieldName = field.name as keyof Q["data"] & string;
      const queryData = query.data as Record<string, unknown>;
      if (queryData[fieldName] !== undefined) {
        if (field.kind === "object") {
          throw new Error("Object updates not yet supported");
        } else if (field.isList) {
          throw new Error("List updates not yet supported");
        } else {
          const jsType = prismaToJsTypes.get(field.type);
          if (!jsType) throw new Error(`Unsupported type: ${field.type}`);
          if (typeof queryData[fieldName] === jsType) {
            record[fieldName] = queryData[fieldName];
          } else {
            throw new Error("Indirect updates not yet supported");
          }
        }
      }
    });
    await this.client.db.put(this.model.name, record);
    this.emit("update");
    return record as Prisma.Result<T, Q, "update">;
  }

  async count<Q extends Prisma.Args<T, "count">>(query: Q): Promise<Prisma.Result<T, Q, "count">> {
    const records = filterByWhereClause(await this.client.db.getAll(this.model.name), this.keyPath, query?.where);
    return records.length as Prisma.Result<T, Q, "count">;
  }

  async aggregate<Q extends Prisma.Args<T, "aggregate">>(query: Q): Promise<Prisma.Result<T, Q, "aggregate">> {
    let records = await this.client.db.getAll(`${toCamelCase(this.model.name)}`);
    if (query.where) {
      records = filterByWhereClause(records, this.keyPath, query.where);
    }

    const results: Partial<Prisma.Result<T, Q, "aggregate">> = {};

    let count = 0;
    let sum = 0;
    let min: number | null = null;
    let max: number | null = null;

    records.forEach((record) => {
      if (query._count) {
        const key = Object.keys(query._count)[0];
        console.log(query._count[key]);
        if (record[key] === query._count[key]) {
          count += 1;
        }
      }

      if (query._sum) {
        const key = Object.keys(query._sum)[0];
        const value = record[key];
        if (typeof value === "number") {
          sum += value;
        }
      }

      if (query._min) {
        const key = Object.keys(query._min)[0];
        const value = record[key];
        if (typeof value === "number") {
          min = min === null ? value : Math.min(min, value);
        }
      }

      if (query._max) {
        const key = Object.keys(query._max)[0];
        const value = record[key];
        if (typeof value === "number") {
          max = max === null ? value : Math.max(max, value);
        }
      }
    });

    if (query._count) results._count = count as Prisma.Result<T, Q, "aggregate">["_count"];
    if (query._sum) results._sum = sum as Prisma.Result<T, Q, "aggregate">["_sum"];
    if (query._min) results._min = min;
    if (query._max) results._max = max;

    return results as unknown as Prisma.Result<T, Q, "aggregate">;
  }
}
