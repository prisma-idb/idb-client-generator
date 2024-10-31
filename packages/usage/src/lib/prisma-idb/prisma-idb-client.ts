import { openDB } from "idb";
import type { IDBPDatabase } from "idb";
import type { Prisma } from "@prisma/client";
import { filterByWhereClause, toCamelCase, generateIDBKey, getModelFieldData, prismaToJsTypes } from "./utils";
import type { Model } from "./utils";

const IDB_VERSION: number = 1;

type ModelDelegate = Prisma.TodoDelegate;

export class PrismaIDBClient {
  private static instance: PrismaIDBClient;
  db!: IDBPDatabase;

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
    this.db = await openDB("prisma-idb", IDB_VERSION, {
      upgrade(db) {
        db.createObjectStore("todo", { keyPath: ["id"] });
      },
    });
    this.todo = new BaseIDBModelClass<Prisma.TodoDelegate>(this, ["id"], {
      name: "Todo",
      dbName: null,
      fields: [
        {
          name: "id",
          kind: "scalar",
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: true,
          isReadOnly: false,
          hasDefaultValue: true,
          type: "String",
          default: { name: "uuid(4)", args: [] },
          isGenerated: false,
          isUpdatedAt: false,
        },
        {
          name: "task",
          kind: "scalar",
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: false,
          isReadOnly: false,
          hasDefaultValue: false,
          type: "String",
          isGenerated: false,
          isUpdatedAt: false,
        },
        {
          name: "isCompleted",
          kind: "scalar",
          isList: false,
          isRequired: true,
          isUnique: false,
          isId: false,
          isReadOnly: false,
          hasDefaultValue: false,
          type: "Boolean",
          isGenerated: false,
          isUpdatedAt: false,
        },
      ],
      primaryKey: null,
      uniqueFields: [],
      uniqueIndexes: [],
      isGenerated: false,
    });
  }
}

class BaseIDBModelClass<T extends ModelDelegate> {
  client: PrismaIDBClient;
  keyPath: string[];
  private model: Model;
  private eventEmitter: EventTarget;

  constructor(client: PrismaIDBClient, keyPath: string[], model: Model) {
    this.client = client;
    this.keyPath = keyPath;
    this.model = model;
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

  async fillDefaults<D extends Prisma.Args<T, "create">["data"]>(data: D) {
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
                const transaction = this.client.db.transaction(toCamelCase(this.model.name), "readonly");
                const store = transaction.objectStore(toCamelCase(this.model.name));
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
    const records = await this.client.db.getAll(`${toCamelCase(this.model.name)}`);
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
          [await this.client.db.get(toCamelCase(this.model.name), Object.values(queryWhere[keyFieldName]!) ?? null)],
          this.keyPath,
          query.where,
        )[0] as Prisma.Args<T, "findUnique">) ?? null
      );
    } else {
      const identifierFieldName = JSON.parse(generateIDBKey(this.model))[0];
      if (queryWhere[identifierFieldName]) {
        return (
          (await this.client.db.get(toCamelCase(this.model.name), [queryWhere[identifierFieldName]] as IDBValidKey)) ??
          null
        );
      }
    }
    getModelFieldData(this.model)
      .nonKeyUniqueFields.map(({ name }) => name)
      .forEach(async (uniqueField) => {
        {
          if (!queryWhere[uniqueField]) return;
          return (
            (await this.client.db.getFromIndex(
              toCamelCase(this.model.name),
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
    await this.client.db.add(toCamelCase(this.model.name), record);
    this.emit("create");
    return record as Prisma.Result<T, Q, "create">;
  }

  async createMany<Q extends Prisma.Args<T, "createMany">>(query: Q): Promise<Prisma.Result<T, Q, "createMany">> {
    const tx = this.client.db.transaction(toCamelCase(this.model.name), "readwrite");
    const queryData = Array.isArray(query.data) ? query.data : [query.data];
    await Promise.all([...queryData.map(async (record) => tx.store.add(await this.fillDefaults(record))), tx.done]);
    this.emit("create");
    return { count: queryData.length } as Prisma.Result<T, Q, "createMany">;
  }

  async delete<Q extends Prisma.Args<T, "delete">>(query: Q): Promise<Prisma.Result<T, Q, "delete">> {
    const records = filterByWhereClause(
      await this.client.db.getAll(toCamelCase(this.model.name)),
      this.keyPath,
      query.where,
    );
    if (records.length === 0) throw new Error("Record not found");

    await this.client.db.delete(
      toCamelCase(this.model.name),
      this.keyPath.map((keyField) => records[0][keyField] as IDBValidKey),
    );
    this.emit("delete");
    return records[0] as Prisma.Result<T, Q, "delete">;
  }

  async deleteMany<Q extends Prisma.Args<T, "deleteMany">>(query: Q) {
    const records = filterByWhereClause(
      await this.client.db.getAll(toCamelCase(this.model.name)),
      this.keyPath,
      query?.where,
    );
    if (records.length === 0) return { count: 0 } as Prisma.Result<T, Q, "deleteMany">;

    const tx = this.client.db.transaction(toCamelCase(this.model.name), "readwrite");
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
    await this.client.db.put(toCamelCase(this.model.name), record);
    this.emit("update");
    return record as Prisma.Result<T, Q, "update">;
  }
}
