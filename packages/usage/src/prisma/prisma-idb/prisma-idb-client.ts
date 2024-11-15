import type { Prisma } from "@prisma/client";
import type { IDBPDatabase, StoreNames } from "idb";
import { openDB } from "idb";
import type { PrismaIDBSchema } from "./idb-interface";
import type { CreateTransactionType } from "./idb-utils";
import { convertToArray } from "./idb-utils";

const IDB_VERSION = 1;

export class PrismaIDBClient {
  private static instance: PrismaIDBClient;
  _db!: IDBPDatabase<PrismaIDBSchema>;

  private constructor() {}

  user!: UserIDBClass;
  profile!: ProfileIDBClass;

  public static async create(): Promise<PrismaIDBClient> {
    if (!PrismaIDBClient.instance) {
      const client = new PrismaIDBClient();
      await client.initialize();
      PrismaIDBClient.instance = client;
    }
    return PrismaIDBClient.instance;
  }

  private async initialize() {
    this._db = await openDB<PrismaIDBSchema>("prisma-idb", IDB_VERSION, {
      upgrade(db) {
        db.createObjectStore("User", { keyPath: ["id"] });
        const ProfileStore = db.createObjectStore("Profile", { keyPath: ["id"] });
        ProfileStore.createIndex("userIdIndex", ["userId"], { unique: true });
      },
    });
    this.user = new UserIDBClass(this, ["id"]);
    this.profile = new ProfileIDBClass(this, ["id"]);
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
      const attach_profile = query.select?.profile || query.include?.profile;
      if (attach_profile) {
        unsafeRecord["profile"] = await this.client.profile.findUnique({
          ...(attach_profile === true ? {} : attach_profile),
          where: { userId: record.id },
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
    if (data.id === undefined) {
      const transaction = this.client._db.transaction("User", "readonly");
      const store = transaction.objectStore("User");
      const cursor = await store.openCursor(null, "prev");
      data.id = cursor ? Number(cursor.key) + 1 : 1;
    }
    if (data.profileId === undefined) {
      data.profileId = null;
    }
    return data as Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">;
  }

  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.UserDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    if (data.profile) {
      neededStores.add("Profile");
      if (data.profile.create) {
        convertToArray(data.profile.create).forEach((record) =>
          this.client.profile._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.profile.connectOrCreate) {
        convertToArray(data.profile.connectOrCreate).forEach((record) =>
          this.client.profile
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    return neededStores;
  }

  private async performNestedCreates<D extends Prisma.Args<Prisma.UserDelegate, "create">["data"]>(
    data: D,
    tx: CreateTransactionType,
  ) {}

  async findMany<Q extends Prisma.Args<Prisma.UserDelegate, "findMany">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findMany">> {
    const records = await this.client._db.getAll("User");
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
    if (query.where.id) {
      record = await this.client._db.get("User", [query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select)[0];
    return recordWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "findUnique">;
  }

  async create<Q extends Prisma.Args<Prisma.UserDelegate, "create">>(
    query: Q,
    tx?: CreateTransactionType,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "create">> {
    const record = await this.fillDefaults(query.data);
    if (!tx) {
      const storesNeeded = this._getNeededStoresForCreate(query.data);
      if (storesNeeded.size === 0) {
        await this.client._db.add("User", record);
      } else {
        const tx = this.client._db.transaction(["User", ...Array.from(storesNeeded)], "readwrite");
        await this.performNestedCreates(query.data, tx);
        await tx.objectStore("User").add(record);
        tx.commit();
      }
    } else {
      await this.performNestedCreates(query.data, tx);
      await tx.objectStore("User").add(record);
    }
    const recordsWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select);
    return recordsWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "create">;
  }
}

class ProfileIDBClass extends BaseIDBModelClass {
  private applySelectClause<S extends Prisma.Args<Prisma.ProfileDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.ProfileDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.ProfileDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey in Object.keys(record)) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.ProfileDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async applyRelations<Q extends Prisma.Args<Prisma.ProfileDelegate, "findMany">>(
    records: Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow">[],
    query?: Q,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.ProfileDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_user = query.select?.user || query.include?.user;
      if (attach_user) {
        unsafeRecord["user"] = await this.client.user.findUnique({
          ...(attach_user === true ? {} : attach_user),
          where: { id: record.userId },
        });
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.ProfileDelegate, Q, "findFirstOrThrow">[];
  }

  private async fillDefaults<D extends Prisma.Args<Prisma.ProfileDelegate, "create">["data"]>(
    data: D,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow">> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.id === undefined) {
      const transaction = this.client._db.transaction("Profile", "readonly");
      const store = transaction.objectStore("Profile");
      const cursor = await store.openCursor(null, "prev");
      data.id = cursor ? Number(cursor.key) + 1 : 1;
    }
    if (data.bio === undefined) {
      data.bio = null;
    }
    return data as Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow">;
  }

  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.ProfileDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    if (data.user) {
      neededStores.add("User");
      if (data.user.create) {
        convertToArray(data.user.create).forEach((record) =>
          this.client.user._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.user.connectOrCreate) {
        convertToArray(data.user.connectOrCreate).forEach((record) =>
          this.client.user._getNeededStoresForCreate(record.create).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    return neededStores;
  }

  private async performNestedCreates<D extends Prisma.Args<Prisma.ProfileDelegate, "create">["data"]>(
    data: D,
    tx: CreateTransactionType,
  ) {}

  async findMany<Q extends Prisma.Args<Prisma.ProfileDelegate, "findMany">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findMany">> {
    const records = await this.client._db.getAll("Profile");
    const relationAppliedRecords = (await this.applyRelations(records, query)) as Prisma.Result<
      Prisma.ProfileDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this.applySelectClause(relationAppliedRecords, selectClause);
    return selectAppliedRecords as Prisma.Result<Prisma.ProfileDelegate, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<Prisma.ProfileDelegate, "findFirst">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findFirst">> {
    return (await this.findMany(query))[0];
  }

  async findUnique<Q extends Prisma.Args<Prisma.ProfileDelegate, "findUnique">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findUnique">> {
    let record;
    if (query.where.id) {
      record = await this.client._db.get("Profile", [query.where.id]);
    } else if (query.where.userId) {
      record = await this.client._db.getFromIndex("Profile", "userIdIndex", [query.where.userId]);
    }
    if (!record) return null;

    const recordWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select)[0];
    return recordWithRelations as Prisma.Result<Prisma.ProfileDelegate, Q, "findUnique">;
  }

  async create<Q extends Prisma.Args<Prisma.ProfileDelegate, "create">>(
    query: Q,
    tx?: CreateTransactionType,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "create">> {
    const record = await this.fillDefaults(query.data);
    if (!tx) {
      const storesNeeded = this._getNeededStoresForCreate(query.data);
      if (storesNeeded.size === 0) {
        await this.client._db.add("Profile", record);
      } else {
        const tx = this.client._db.transaction(["Profile", ...Array.from(storesNeeded)], "readwrite");
        await this.performNestedCreates(query.data, tx);
        await tx.objectStore("Profile").add(record);
        tx.commit();
      }
    } else {
      await this.performNestedCreates(query.data, tx);
      await tx.objectStore("Profile").add(record);
    }
    const recordsWithRelations = this.applySelectClause(await this.applyRelations([record], query), query.select);
    return recordsWithRelations as Prisma.Result<Prisma.ProfileDelegate, Q, "create">;
  }
}
