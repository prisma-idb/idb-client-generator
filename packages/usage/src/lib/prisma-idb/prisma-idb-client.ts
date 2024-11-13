import type { Prisma } from "@prisma/client";
import type { IDBPDatabase } from "idb";
import { openDB } from "idb";
import * as models from "./datamodel";
import type { PrismaIDBSchema } from "./idb-interface";
import type { Model } from "./utils";
import { filterByWhereClause, generateIDBKey, getModelFieldData, prismaToJsTypes } from "./utils";

const IDB_VERSION: number = 1;

export type ModelDelegate = Prisma.UserDelegate | Prisma.TodoDelegate;
type ObjectStoreName = (typeof PrismaIDBClient.prototype.db.objectStoreNames)[number];

export class PrismaIDBClient {
  private static instance: PrismaIDBClient;
  db!: IDBPDatabase<PrismaIDBSchema>;

  private constructor() {}

  user!: BaseIDBModelClass<Prisma.UserDelegate>;
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
        db.createObjectStore("User", { keyPath: ["id"] });
        db.createObjectStore("Todo", { keyPath: ["id"] });
      },
    });
    this.user = new BaseIDBModelClass<Prisma.UserDelegate>(this, ["id"], models.User);
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

  private async fillDefaults<Q extends Prisma.Args<T, "findFirstOrThrow">, D = Prisma.Args<T, "create">["data"]>(
    data: D,
  ): Promise<Prisma.Result<T, Q, "findFirstOrThrow">> {
    if (data === undefined) data = {} as D;
    await Promise.all(
      this.model.fields
        .filter(({ hasDefaultValue }) => hasDefaultValue)
        .map(async (field) => {
          const fieldName = field.name as keyof D;
          const defaultValue = field.default!;
          if (data[fieldName] === undefined) {
            if (typeof defaultValue === "object" && "name" in defaultValue) {
              if (defaultValue.name === "uuid(4)") {
                data[fieldName] = crypto.randomUUID() as (typeof data)[typeof fieldName];
              } else if (defaultValue.name === "cuid") {
                const { createId } = await import("@paralleldrive/cuid2");
                data[fieldName] = createId() as (typeof data)[typeof fieldName];
              } else if (defaultValue.name === "autoincrement") {
                const transaction = this.client.db.transaction(this.model.name, "readonly");
                const store = transaction.objectStore(this.model.name);
                const cursor = await store.openCursor(null, "prev");
                data[fieldName] = (cursor ? Number(cursor.key) + 1 : 1) as (typeof data)[typeof fieldName];
              }
            } else {
              data[fieldName] = defaultValue as (typeof data)[typeof fieldName];
            }
          }
        }),
    );
    this.model.fields
      .filter((field) => field.type === "DateTime")
      .forEach((field) => {
        const fieldName = field.name as keyof D;
        if (typeof data[fieldName] === "string") {
          data[fieldName] = new Date(data[fieldName]) as D[keyof D];
        }
      });
    return data as unknown as Prisma.Result<T, Q, "findFirstOrThrow">;
  }

  async findMany<Q extends Prisma.Args<T, "findMany">>(query?: Q): Promise<Prisma.Result<T, Q, "findMany">> {
    const records = (await this.client.db.getAll(this.model.name)) as Prisma.Result<T, Q, "findFirstOrThrow">[];
    return filterByWhereClause<T, Q>(records, this.keyPath, query?.where) as Prisma.Result<T, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<T, "findFirst">>(query?: Q): Promise<Prisma.Result<T, Q, "findFirst"> | null> {
    return ((await this.findMany(query))[0] as Prisma.Result<T, Q, "findFirst"> | undefined) ?? null;
  }

  async findUnique<Q extends Prisma.Args<T, "findUnique">>(
    query: Q,
  ): Promise<Prisma.Result<T, Q, "findUnique"> | null> {
    const queryWhere = query.where as Record<string, unknown>;
    if (this.model.primaryKey && this.model.primaryKey.fields.length > 1) {
      const keyFieldValue = queryWhere[this.model.primaryKey.fields.join("_")] as Record<string, unknown>;
      const tupleKey = this.keyPath.map((key) => keyFieldValue[key]) as PrismaIDBSchema[typeof this.model.name]["key"];
      const foundRecord = await this.client.db.get(this.model.name, tupleKey);
      if (!foundRecord) return null;
      return (
        (filterByWhereClause([foundRecord], this.keyPath, query.where)[0] as Prisma.Result<T, Q, "findUnique">) ?? null
      );
    } else {
      const identifierFieldName = JSON.parse(generateIDBKey(this.model))[0];
      if (queryWhere[identifierFieldName]) {
        return ((await this.client.db.get(this.model.name, [
          queryWhere[identifierFieldName],
        ] as unknown as PrismaIDBSchema[typeof this.model.name]["key"])) ?? null) as Prisma.Result<T, Q, "findUnique">;
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
    const record = await this.fillDefaults<Q>(query.data);
    await this.client.db.add(this.model.name, record);
    this.emit("create");
    return record as Prisma.Result<T, Q, "create">;
  }

  async createMany<Q extends Prisma.Args<T, "createMany">>(query: Q): Promise<Prisma.Result<T, Q, "createMany">> {
    const tx = this.client.db.transaction(this.model.name, "readwrite");
    const queryData = Array.isArray(query.data) ? query.data : [query.data];
    await Promise.all([...queryData.map(async (record) => tx.store.add(await this.fillDefaults<Q>(record))), tx.done]);
    this.emit("create");
    return { count: queryData.length } as Prisma.Result<T, Q, "createMany">;
  }

  async delete<Q extends Prisma.Args<T, "delete">>(query: Q): Promise<Prisma.Result<T, Q, "delete">> {
    const records = filterByWhereClause(await this.client.db.getAll(this.model.name), this.keyPath, query.where);
    if (records.length === 0) throw new Error("Record not found");

    await this.client.db.delete(
      this.model.name,
      this.keyPath.map(
        (keyField) => records[0][keyField as keyof (typeof records)[number]] as IDBValidKey,
      ) as PrismaIDBSchema[typeof this.model.name]["key"],
    );
    this.emit("delete");
    return records[0] as Prisma.Result<T, Q, "delete">;
  }

  async deleteMany<Q extends Prisma.Args<T, "deleteMany">>(query: Q): Promise<Prisma.Result<T, Q, "deleteMany">> {
    const records = filterByWhereClause(await this.client.db.getAll(this.model.name), this.keyPath, query?.where);
    if (records.length === 0) return { count: 0 } as Prisma.Result<T, Q, "deleteMany">;

    const tx = this.client.db.transaction(this.model.name, "readwrite");
    await Promise.all([
      ...records.map((record) =>
        tx.store.delete(
          this.keyPath.map(
            (keyField) => record[keyField as keyof typeof record] as IDBValidKey,
          ) as PrismaIDBSchema[typeof this.model.name]["key"],
        ),
      ),
      tx.done,
    ]);
    this.emit("delete");
    return { count: records.length } as Prisma.Result<T, Q, "deleteMany">;
  }

  async update<Q extends Prisma.Args<T, "update">>(query: Q): Promise<Prisma.Result<T, Q, "update">> {
    const record = await this.findFirst(query);
    if (record === null) throw new Error("Record not found");

    this.model.fields.forEach((field) => {
      const fieldName = field.name as keyof typeof record & keyof typeof query.data;
      if (query.data[fieldName] !== undefined) {
        if (field.kind === "object") {
          throw new Error("Object updates not yet supported");
        } else if (field.isList) {
          throw new Error("List updates not yet supported");
        } else {
          const fieldType = field.type as typeof prismaToJsTypes extends Map<infer K, unknown> ? K : never;
          const jsType = prismaToJsTypes.get(fieldType);
          if (!jsType || jsType === "unknown") throw new Error(`Unsupported type: ${field.type}`);

          if (typeof query.data[fieldName] === jsType) {
            record[fieldName] = query.data[fieldName];
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
}
