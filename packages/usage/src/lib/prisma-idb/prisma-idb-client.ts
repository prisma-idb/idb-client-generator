import { openDB } from "idb";
import type { IDBPDatabase } from "idb";
import type { Prisma } from "@prisma/client";
import { filterByWhereClause, toCamelCase } from "./utils";
import type { DMMF } from "@prisma/client/runtime/library";

const IDB_VERSION: number = 1;

type ModelDelegate = Prisma.TodoDelegate;
type Model = DMMF.Datamodel["models"][number];

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
    this.model.fields
      .filter(({ hasDefaultValue }) => hasDefaultValue)
      .forEach(async (field) => {
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
              const transaction = this.client.db.transaction(toCamelCase(this.model.name), "readonly");
              const store = transaction.objectStore(toCamelCase(this.model.name));
              const cursor = await store.openCursor(null, "prev");
              data[fieldName] = (cursor ? Number(cursor.key) + 1 : 1) as (typeof data)[typeof fieldName];
            }
          } else {
            data[fieldName] = defaultValue as (typeof data)[typeof fieldName];
          }
        }
      });
    return data;
  }

  async findMany<Q extends Prisma.Args<T, "findMany">>(query?: Q): Promise<Prisma.Result<T, Q, "findMany">> {
    const records = await this.client.db.getAll(`${toCamelCase(this.model.name)}`);
    return filterByWhereClause(records, this.keyPath, query?.where) as Prisma.Result<T, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<T, "findFirst">>(query?: Q): Promise<Prisma.Result<T, Q, "findFirst"> | null> {
    return ((await this.findMany(query))[0] as Prisma.Result<T, Q, "findFirst"> | undefined) ?? null;
  }
}
