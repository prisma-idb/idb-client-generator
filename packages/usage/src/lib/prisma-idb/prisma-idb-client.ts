import type { Prisma } from "@prisma/client";
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
  optionalFields!: OptionalFieldsIDBClass;

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
        db.createObjectStore("User", { keyPath: ["userId"] });
        db.createObjectStore("Todo", { keyPath: ["todoId"] });
        db.createObjectStore("OptionalFields", { keyPath: ["uuid"] });
      },
    });
    this.user = new UserIDBClass(this, ["userId"]);
    this.todo = new TodoIDBClass(this, ["todoId"]);
    this.optionalFields = new OptionalFieldsIDBClass(this, ["uuid"]);
  }
}

class BaseIDBModelClass {
  protected client: PrismaIDBClient;
  protected keyPath: string[];
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

  protected emit(event: "create" | "update" | "delete") {
    this.eventEmitter.dispatchEvent(new Event(event));
  }
}

class UserIDBClass extends BaseIDBModelClass {
  private applySelectClause<S extends Prisma.Args<Prisma.UserDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.UserDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.UserDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey in Object.keys(record)) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.UserDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async applyRelations<Q extends Prisma.Args<Prisma.UserDelegate, "findMany">>(
    records: Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">[],
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_assignedTodos = query.select?.assignedTodos || query.include?.assignedTodos;
      if (attach_assignedTodos) {
        unsafeRecord["assignedTodos"] = await this.client.todo.findMany({
          ...(attach_assignedTodos === true ? {} : attach_assignedTodos),
          where: { assignedUserId: record.userId },
        });
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">[];
  }

  private async fillDefaults<D extends Prisma.Args<Prisma.UserDelegate, "create">["data"]>(
    data: D,
  ): Promise<Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.userId === undefined) {
      const transaction = this.client.db.transaction("User", "readonly");
      const store = transaction.objectStore("User");
      const cursor = await store.openCursor(null, "prev");
      data.userId = cursor ? Number(cursor.key) + 1 : 1;
    }
    return data as Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">;
  }

  async findMany<Q extends Prisma.Args<Prisma.UserDelegate, "findMany">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findMany">> {
    const records = await this.client.db.getAll("User");
    const relationAppliedRecords = (await this.applyRelations(records, query)) as Prisma.Result<
      Prisma.UserDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this.applySelectClause(relationAppliedRecords, selectClause);
    return selectAppliedRecords as Prisma.Result<Prisma.UserDelegate, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<Prisma.UserDelegate, "findFirst">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findFirst">> {
    return (await this.findMany(query))[0];
  }

  async create<Q extends Prisma.Args<Prisma.UserDelegate, "create">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "create">> {
    const record = await this.fillDefaults(query.data);
    await this.client.db.add("User", record);
    const recordsWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select);
    return recordsWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "create">;
  }
}

class TodoIDBClass extends BaseIDBModelClass {
  private applySelectClause<S extends Prisma.Args<Prisma.TodoDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.TodoDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.TodoDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey in Object.keys(record)) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.TodoDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async applyRelations<Q extends Prisma.Args<Prisma.TodoDelegate, "findMany">>(
    records: Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow">[],
    query?: Q,
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.TodoDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_assignedUser = query.select?.assignedUser || query.include?.assignedUser;
      if (attach_assignedUser) {
        if (record.assignedUserId !== null) {
          unsafeRecord["assignedUser"] = await this.client.user.findFirst({
            ...(attach_assignedUser === true ? {} : attach_assignedUser),
            where: { userId: record.assignedUserId },
          });
        } else {
          unsafeRecord["assignedUser"] = null;
        }
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.TodoDelegate, Q, "findFirstOrThrow">[];
  }

  private async fillDefaults<D extends Prisma.Args<Prisma.TodoDelegate, "create">["data"]>(
    data: D,
  ): Promise<Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow">> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.todoId === undefined) {
      const transaction = this.client.db.transaction("Todo", "readonly");
      const store = transaction.objectStore("Todo");
      const cursor = await store.openCursor(null, "prev");
      data.todoId = cursor ? Number(cursor.key) + 1 : 1;
    }
    if (data.assignedUserId === undefined) {
      data.assignedUserId = null;
    }
    return data as Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow">;
  }

  async findMany<Q extends Prisma.Args<Prisma.TodoDelegate, "findMany">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "findMany">> {
    const records = await this.client.db.getAll("Todo");
    const relationAppliedRecords = (await this.applyRelations(records, query)) as Prisma.Result<
      Prisma.TodoDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this.applySelectClause(relationAppliedRecords, selectClause);
    return selectAppliedRecords as Prisma.Result<Prisma.TodoDelegate, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<Prisma.TodoDelegate, "findFirst">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "findFirst">> {
    return (await this.findMany(query))[0];
  }

  async create<Q extends Prisma.Args<Prisma.TodoDelegate, "create">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "create">> {
    const record = await this.fillDefaults(query.data);
    await this.client.db.add("Todo", record);
    const recordsWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select);
    return recordsWithRelations as Prisma.Result<Prisma.TodoDelegate, Q, "create">;
  }
}

class OptionalFieldsIDBClass extends BaseIDBModelClass {
  private applySelectClause<S extends Prisma.Args<Prisma.OptionalFieldsDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.OptionalFieldsDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.OptionalFieldsDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.OptionalFieldsDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey in Object.keys(record)) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.OptionalFieldsDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async applyRelations<Q extends Prisma.Args<Prisma.OptionalFieldsDelegate, "findMany">>(
    records: Prisma.Result<Prisma.OptionalFieldsDelegate, object, "findFirstOrThrow">[],
    query?: Q,
  ): Promise<Prisma.Result<Prisma.OptionalFieldsDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.OptionalFieldsDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<
      Prisma.OptionalFieldsDelegate,
      Q,
      "findFirstOrThrow"
    >[];
  }

  private async fillDefaults<D extends Prisma.Args<Prisma.OptionalFieldsDelegate, "create">["data"]>(
    data: D,
  ): Promise<Prisma.Result<Prisma.OptionalFieldsDelegate, object, "findFirstOrThrow">> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.uuid === undefined) {
      data.uuid = crypto.randomUUID();
    }
    if (data.cuid === undefined) {
      const { createId } = await import("@paralleldrive/cuid2");
      data.cuid = createId();
    }
    if (data.autoincrement === undefined) {
      const transaction = this.client.db.transaction("OptionalFields", "readonly");
      const store = transaction.objectStore("OptionalFields");
      const cursor = await store.openCursor(null, "prev");
      data.autoincrement = cursor ? Number(cursor.key) + 1 : 1;
    }
    if (data.default === undefined) {
      data.default = "hi";
    }
    if (data.defaultNum === undefined) {
      data.defaultNum = 3.75;
    }
    if (data.defaultArr === undefined) {
      data.defaultArr = ["hmm", "hello"];
    }
    if (data.defaultNumArr === undefined) {
      data.defaultNumArr = [1, 3, 5];
    }
    if (data.optionalField === undefined) {
      data.optionalField = null;
    }
    if (data.optionalFieldWithDefault === undefined) {
      data.optionalFieldWithDefault = "not null";
    }
    if (data.optionalDateField === undefined) {
      data.optionalDateField = null;
    }
    if (typeof data.optionalDateField === "string") {
      data.optionalDateField = new Date(data.optionalDateField);
    }
    if (data.defaultDateField === undefined) {
      data.defaultDateField = new Date();
    }
    if (typeof data.defaultDateField === "string") {
      data.defaultDateField = new Date(data.defaultDateField);
    }
    if (data.optionalDateWithDefault === undefined) {
      data.optionalDateWithDefault = new Date();
    }
    if (typeof data.optionalDateWithDefault === "string") {
      data.optionalDateWithDefault = new Date(data.optionalDateWithDefault);
    }
    return data as Prisma.Result<Prisma.OptionalFieldsDelegate, object, "findFirstOrThrow">;
  }

  async findMany<Q extends Prisma.Args<Prisma.OptionalFieldsDelegate, "findMany">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.OptionalFieldsDelegate, Q, "findMany">> {
    const records = await this.client.db.getAll("OptionalFields");
    const relationAppliedRecords = (await this.applyRelations(records, query)) as Prisma.Result<
      Prisma.OptionalFieldsDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this.applySelectClause(relationAppliedRecords, selectClause);
    return selectAppliedRecords as Prisma.Result<Prisma.OptionalFieldsDelegate, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<Prisma.OptionalFieldsDelegate, "findFirst">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.OptionalFieldsDelegate, Q, "findFirst">> {
    return (await this.findMany(query))[0];
  }

  async create<Q extends Prisma.Args<Prisma.OptionalFieldsDelegate, "create">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.OptionalFieldsDelegate, Q, "create">> {
    const record = await this.fillDefaults(query.data);
    await this.client.db.add("OptionalFields", record);
    const recordsWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select);
    return recordsWithRelations as Prisma.Result<Prisma.OptionalFieldsDelegate, Q, "create">;
  }
}
