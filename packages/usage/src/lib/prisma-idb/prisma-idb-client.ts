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
  uniqueUserModel!: UniqueUserModelIDBClass;
  iDUserModel!: IDUserModelIDBClass;
  uniqueAndIdFieldsModel!: UniqueAndIdFieldsModelIDBClass;
  optionalFieldsModel!: OptionalFieldsModelIDBClass;

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
        const UserStore = db.createObjectStore("User", { keyPath: ["userId"] });
        UserStore.createIndex("nameIndex", ["name"], { unique: true });
        db.createObjectStore("Todo", { keyPath: ["todoId"] });
        db.createObjectStore("UniqueUserModel", { keyPath: ["firstName", "lastName"] });
        db.createObjectStore("IDUserModel", { keyPath: ["firstName", "lastName"] });
        const UniqueAndIdFieldsModelStore = db.createObjectStore("UniqueAndIdFieldsModel", {
          keyPath: ["firstName", "lastName"],
        });
        UniqueAndIdFieldsModelStore.createIndex("uniqueFieldIndex", ["uniqueField"], { unique: true });
        UniqueAndIdFieldsModelStore.createIndex("uniqueStringFieldIndex", ["uniqueStringField"], { unique: true });
        UniqueAndIdFieldsModelStore.createIndex("emailProvider_emailDomainIndex", ["emailProvider", "emailDomain"], {
          unique: true,
        });
        UniqueAndIdFieldsModelStore.createIndex("uniqueNameIndex", ["firstName", "lastName"], { unique: true });
        db.createObjectStore("OptionalFieldsModel", { keyPath: ["uuid"] });
      },
    });
    this.user = new UserIDBClass(this, ["userId"]);
    this.todo = new TodoIDBClass(this, ["todoId"]);
    this.uniqueUserModel = new UniqueUserModelIDBClass(this, ["firstName", "lastName"]);
    this.iDUserModel = new IDUserModelIDBClass(this, ["firstName", "lastName"]);
    this.uniqueAndIdFieldsModel = new UniqueAndIdFieldsModelIDBClass(this, ["firstName", "lastName"]);
    this.optionalFieldsModel = new OptionalFieldsModelIDBClass(this, ["uuid"]);
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

  async findUnique<Q extends Prisma.Args<Prisma.UserDelegate, "findUnique">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findUnique">> {
    let record;
    if (query.where.userId) {
      record = await this.client.db.get("User", [query.where.userId]);
    } else if (query.where.name) {
      record = await this.client.db.getFromIndex("User", "nameIndex", [query.where.name]);
    }
    if (!record) return null;

    const recordWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select)[0];
    return recordWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "findUnique">;
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

  async findUnique<Q extends Prisma.Args<Prisma.TodoDelegate, "findUnique">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "findUnique">> {
    let record;
    if (query.where.todoId) {
      record = await this.client.db.get("Todo", [query.where.todoId]);
    }
    if (!record) return null;

    const recordWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select)[0];
    return recordWithRelations as Prisma.Result<Prisma.TodoDelegate, Q, "findUnique">;
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

class UniqueUserModelIDBClass extends BaseIDBModelClass {
  private applySelectClause<S extends Prisma.Args<Prisma.UniqueUserModelDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.UniqueUserModelDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.UniqueUserModelDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.UniqueUserModelDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey in Object.keys(record)) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.UniqueUserModelDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async applyRelations<Q extends Prisma.Args<Prisma.UniqueUserModelDelegate, "findMany">>(
    records: Prisma.Result<Prisma.UniqueUserModelDelegate, object, "findFirstOrThrow">[],
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UniqueUserModelDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.UniqueUserModelDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<
      Prisma.UniqueUserModelDelegate,
      Q,
      "findFirstOrThrow"
    >[];
  }

  private async fillDefaults<D extends Prisma.Args<Prisma.UniqueUserModelDelegate, "create">["data"]>(
    data: D,
  ): Promise<Prisma.Result<Prisma.UniqueUserModelDelegate, object, "findFirstOrThrow">> {
    if (data === undefined) data = {} as NonNullable<D>;
    return data as Prisma.Result<Prisma.UniqueUserModelDelegate, object, "findFirstOrThrow">;
  }

  async findMany<Q extends Prisma.Args<Prisma.UniqueUserModelDelegate, "findMany">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UniqueUserModelDelegate, Q, "findMany">> {
    const records = await this.client.db.getAll("UniqueUserModel");
    const relationAppliedRecords = (await this.applyRelations(records, query)) as Prisma.Result<
      Prisma.UniqueUserModelDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this.applySelectClause(relationAppliedRecords, selectClause);
    return selectAppliedRecords as Prisma.Result<Prisma.UniqueUserModelDelegate, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<Prisma.UniqueUserModelDelegate, "findFirst">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UniqueUserModelDelegate, Q, "findFirst">> {
    return (await this.findMany(query))[0];
  }

  async findUnique<Q extends Prisma.Args<Prisma.UniqueUserModelDelegate, "findUnique">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.UniqueUserModelDelegate, Q, "findUnique">> {
    let record;
    if (query.where.firstName_lastName) {
      record = await this.client.db.get("UniqueUserModel", [
        query.where.firstName_lastName.firstName,
        query.where.firstName_lastName.lastName,
      ]);
    }
    if (!record) return null;

    const recordWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select)[0];
    return recordWithRelations as Prisma.Result<Prisma.UniqueUserModelDelegate, Q, "findUnique">;
  }

  async create<Q extends Prisma.Args<Prisma.UniqueUserModelDelegate, "create">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.UniqueUserModelDelegate, Q, "create">> {
    const record = await this.fillDefaults(query.data);
    await this.client.db.add("UniqueUserModel", record);
    const recordsWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select);
    return recordsWithRelations as Prisma.Result<Prisma.UniqueUserModelDelegate, Q, "create">;
  }
}

class IDUserModelIDBClass extends BaseIDBModelClass {
  private applySelectClause<S extends Prisma.Args<Prisma.IDUserModelDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.IDUserModelDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.IDUserModelDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.IDUserModelDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey in Object.keys(record)) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.IDUserModelDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async applyRelations<Q extends Prisma.Args<Prisma.IDUserModelDelegate, "findMany">>(
    records: Prisma.Result<Prisma.IDUserModelDelegate, object, "findFirstOrThrow">[],
    query?: Q,
  ): Promise<Prisma.Result<Prisma.IDUserModelDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.IDUserModelDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<
      Prisma.IDUserModelDelegate,
      Q,
      "findFirstOrThrow"
    >[];
  }

  private async fillDefaults<D extends Prisma.Args<Prisma.IDUserModelDelegate, "create">["data"]>(
    data: D,
  ): Promise<Prisma.Result<Prisma.IDUserModelDelegate, object, "findFirstOrThrow">> {
    if (data === undefined) data = {} as NonNullable<D>;
    return data as Prisma.Result<Prisma.IDUserModelDelegate, object, "findFirstOrThrow">;
  }

  async findMany<Q extends Prisma.Args<Prisma.IDUserModelDelegate, "findMany">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.IDUserModelDelegate, Q, "findMany">> {
    const records = await this.client.db.getAll("IDUserModel");
    const relationAppliedRecords = (await this.applyRelations(records, query)) as Prisma.Result<
      Prisma.IDUserModelDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this.applySelectClause(relationAppliedRecords, selectClause);
    return selectAppliedRecords as Prisma.Result<Prisma.IDUserModelDelegate, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<Prisma.IDUserModelDelegate, "findFirst">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.IDUserModelDelegate, Q, "findFirst">> {
    return (await this.findMany(query))[0];
  }

  async findUnique<Q extends Prisma.Args<Prisma.IDUserModelDelegate, "findUnique">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.IDUserModelDelegate, Q, "findUnique">> {
    let record;
    if (query.where.firstName_lastName) {
      record = await this.client.db.get("IDUserModel", [
        query.where.firstName_lastName.firstName,
        query.where.firstName_lastName.lastName,
      ]);
    }
    if (!record) return null;

    const recordWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select)[0];
    return recordWithRelations as Prisma.Result<Prisma.IDUserModelDelegate, Q, "findUnique">;
  }

  async create<Q extends Prisma.Args<Prisma.IDUserModelDelegate, "create">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.IDUserModelDelegate, Q, "create">> {
    const record = await this.fillDefaults(query.data);
    await this.client.db.add("IDUserModel", record);
    const recordsWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select);
    return recordsWithRelations as Prisma.Result<Prisma.IDUserModelDelegate, Q, "create">;
  }
}

class UniqueAndIdFieldsModelIDBClass extends BaseIDBModelClass {
  private applySelectClause<S extends Prisma.Args<Prisma.UniqueAndIdFieldsModelDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey in Object.keys(record)) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async applyRelations<Q extends Prisma.Args<Prisma.UniqueAndIdFieldsModelDelegate, "findMany">>(
    records: Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, object, "findFirstOrThrow">[],
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<
      Prisma.UniqueAndIdFieldsModelDelegate,
      Q,
      "findFirstOrThrow"
    >[];
  }

  private async fillDefaults<D extends Prisma.Args<Prisma.UniqueAndIdFieldsModelDelegate, "create">["data"]>(
    data: D,
  ): Promise<Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, object, "findFirstOrThrow">> {
    if (data === undefined) data = {} as NonNullable<D>;
    return data as Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, object, "findFirstOrThrow">;
  }

  async findMany<Q extends Prisma.Args<Prisma.UniqueAndIdFieldsModelDelegate, "findMany">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, Q, "findMany">> {
    const records = await this.client.db.getAll("UniqueAndIdFieldsModel");
    const relationAppliedRecords = (await this.applyRelations(records, query)) as Prisma.Result<
      Prisma.UniqueAndIdFieldsModelDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this.applySelectClause(relationAppliedRecords, selectClause);
    return selectAppliedRecords as Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<Prisma.UniqueAndIdFieldsModelDelegate, "findFirst">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, Q, "findFirst">> {
    return (await this.findMany(query))[0];
  }

  async findUnique<Q extends Prisma.Args<Prisma.UniqueAndIdFieldsModelDelegate, "findUnique">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, Q, "findUnique">> {
    let record;
    if (query.where.firstName_lastName) {
      record = await this.client.db.get("UniqueAndIdFieldsModel", [
        query.where.firstName_lastName.firstName,
        query.where.firstName_lastName.lastName,
      ]);
    } else if (query.where.uniqueField) {
      record = await this.client.db.getFromIndex("UniqueAndIdFieldsModel", "uniqueFieldIndex", [
        query.where.uniqueField,
      ]);
    } else if (query.where.uniqueStringField) {
      record = await this.client.db.getFromIndex("UniqueAndIdFieldsModel", "uniqueStringFieldIndex", [
        query.where.uniqueStringField,
      ]);
    } else if (query.where.emailProvider_emailDomain) {
      record = await this.client.db.getFromIndex("UniqueAndIdFieldsModel", "emailProvider_emailDomainIndex", [
        query.where.emailProvider_emailDomain.emailProvider,
        query.where.emailProvider_emailDomain.emailDomain,
      ]);
    } else if (query.where.uniqueName) {
      record = await this.client.db.getFromIndex("UniqueAndIdFieldsModel", "uniqueNameIndex", [
        query.where.uniqueName.firstName,
        query.where.uniqueName.lastName,
      ]);
    }
    if (!record) return null;

    const recordWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select)[0];
    return recordWithRelations as Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, Q, "findUnique">;
  }

  async create<Q extends Prisma.Args<Prisma.UniqueAndIdFieldsModelDelegate, "create">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, Q, "create">> {
    const record = await this.fillDefaults(query.data);
    await this.client.db.add("UniqueAndIdFieldsModel", record);
    const recordsWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select);
    return recordsWithRelations as Prisma.Result<Prisma.UniqueAndIdFieldsModelDelegate, Q, "create">;
  }
}

class OptionalFieldsModelIDBClass extends BaseIDBModelClass {
  private applySelectClause<S extends Prisma.Args<Prisma.OptionalFieldsModelDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.OptionalFieldsModelDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.OptionalFieldsModelDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.OptionalFieldsModelDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey in Object.keys(record)) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.OptionalFieldsModelDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async applyRelations<Q extends Prisma.Args<Prisma.OptionalFieldsModelDelegate, "findMany">>(
    records: Prisma.Result<Prisma.OptionalFieldsModelDelegate, object, "findFirstOrThrow">[],
    query?: Q,
  ): Promise<Prisma.Result<Prisma.OptionalFieldsModelDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.OptionalFieldsModelDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<
      Prisma.OptionalFieldsModelDelegate,
      Q,
      "findFirstOrThrow"
    >[];
  }

  private async fillDefaults<D extends Prisma.Args<Prisma.OptionalFieldsModelDelegate, "create">["data"]>(
    data: D,
  ): Promise<Prisma.Result<Prisma.OptionalFieldsModelDelegate, object, "findFirstOrThrow">> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.uuid === undefined) {
      data.uuid = crypto.randomUUID();
    }
    if (data.cuid === undefined) {
      const { createId } = await import("@paralleldrive/cuid2");
      data.cuid = createId();
    }
    if (data.autoincrement === undefined) {
      const transaction = this.client.db.transaction("OptionalFieldsModel", "readonly");
      const store = transaction.objectStore("OptionalFieldsModel");
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
    return data as Prisma.Result<Prisma.OptionalFieldsModelDelegate, object, "findFirstOrThrow">;
  }

  async findMany<Q extends Prisma.Args<Prisma.OptionalFieldsModelDelegate, "findMany">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.OptionalFieldsModelDelegate, Q, "findMany">> {
    const records = await this.client.db.getAll("OptionalFieldsModel");
    const relationAppliedRecords = (await this.applyRelations(records, query)) as Prisma.Result<
      Prisma.OptionalFieldsModelDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this.applySelectClause(relationAppliedRecords, selectClause);
    return selectAppliedRecords as Prisma.Result<Prisma.OptionalFieldsModelDelegate, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<Prisma.OptionalFieldsModelDelegate, "findFirst">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.OptionalFieldsModelDelegate, Q, "findFirst">> {
    return (await this.findMany(query))[0];
  }

  async findUnique<Q extends Prisma.Args<Prisma.OptionalFieldsModelDelegate, "findUnique">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.OptionalFieldsModelDelegate, Q, "findUnique">> {
    let record;
    if (query.where.uuid) {
      record = await this.client.db.get("OptionalFieldsModel", [query.where.uuid]);
    }
    if (!record) return null;

    const recordWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select)[0];
    return recordWithRelations as Prisma.Result<Prisma.OptionalFieldsModelDelegate, Q, "findUnique">;
  }

  async create<Q extends Prisma.Args<Prisma.OptionalFieldsModelDelegate, "create">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.OptionalFieldsModelDelegate, Q, "create">> {
    const record = await this.fillDefaults(query.data);
    await this.client.db.add("OptionalFieldsModel", record);
    const recordsWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select);
    return recordsWithRelations as Prisma.Result<Prisma.OptionalFieldsModelDelegate, Q, "create">;
  }
}
