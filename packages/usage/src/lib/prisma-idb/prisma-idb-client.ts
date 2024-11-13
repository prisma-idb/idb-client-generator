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
      },
    });
    this.user = new UserIDBClass(this, ["userId"]);
    this.todo = new TodoIDBClass(this, ["todoId"]);
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
}
