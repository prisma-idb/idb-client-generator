import type { Prisma } from "@prisma/client";
import type { IDBPDatabase, StoreNames } from "idb";
import { openDB } from "idb";
import type { PrismaIDBSchema } from "./idb-interface";
import type { CreateTransactionType } from "./idb-utils";
import { convertToArray, whereIntFilter, whereStringFilter } from "./idb-utils";

const IDB_VERSION = 1;

export class PrismaIDBClient {
  private static instance: PrismaIDBClient;
  _db!: IDBPDatabase<PrismaIDBSchema>;

  private constructor() {}

  user!: UserIDBClass;
  profile!: ProfileIDBClass;
  post!: PostIDBClass;

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
        db.createObjectStore("Post", { keyPath: ["id"] });
      },
    });
    this.user = new UserIDBClass(this, ["id"]);
    this.profile = new ProfileIDBClass(this, ["id"]);
    this.post = new PostIDBClass(this, ["id"]);
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
  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.UserDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W): Promise<R[]> {
    if (!whereClause) return records;
    return records.filter((record) => {
      const stringFields = ["name"] as const;
      for (const field of stringFields) {
        if (!whereStringFilter(record, field, whereClause[field])) return false;
      }
      const intFields = ["id"] as const;
      for (const field of intFields) {
        if (!whereIntFilter(record, field, whereClause[field])) return false;
      }
      return true;
    });
  }

  private _applySelectClause<S extends Prisma.Args<Prisma.UserDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.UserDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.UserDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of ["id", "name", "profile", "posts"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.UserDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async _applyRelations<Q extends Prisma.Args<Prisma.UserDelegate, "findMany">>(
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
      const attach_posts = query.select?.posts || query.include?.posts;
      if (attach_posts) {
        unsafeRecord["posts"] = await this.client.post.findMany({
          ...(attach_posts === true ? {} : attach_posts),
          where: { authorId: record.id },
        });
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">[];
  }

  private async _fillDefaults<D extends Prisma.Args<Prisma.UserDelegate, "create">["data"]>(
    data: D,
    tx?: CreateTransactionType,
  ): Promise<Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.id === undefined) {
      const transaction = tx ?? this.client._db.transaction(["User"], "readwrite");
      const store = transaction.objectStore("User");
      const cursor = await store.openCursor(null, "prev");
      data.id = cursor ? Number(cursor.key) + 1 : 1;
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
    if (data.posts) {
      neededStores.add("Post");
      if (data.posts.create) {
        convertToArray(data.posts.create).forEach((record) =>
          this.client.post._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.posts.connectOrCreate) {
        convertToArray(data.posts.connectOrCreate).forEach((record) =>
          this.client.post._getNeededStoresForCreate(record.create).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.posts.createMany) {
        convertToArray(data.posts.createMany.data).forEach((record) =>
          this.client.post._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    return neededStores;
  }

  private _removeNestedCreateData<D extends Prisma.Args<Prisma.UserDelegate, "create">["data"]>(data: D) {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate.profile;
    delete recordWithoutNestedCreate.posts;
    return recordWithoutNestedCreate;
  }

  private async _performNestedCreates<D extends Prisma.Args<Prisma.UserDelegate, "create">["data"]>(
    data: D,
    tx: CreateTransactionType,
  ) {
    if (data.profile) {
      if (data.profile.create) {
        await this.client.profile._nestedCreate(
          {
            data: { ...data.profile.create, userId: data.id! },
          },
          tx,
        );
      }
      if (data.profile.connectOrCreate) {
        throw new Error("connectOrCreate not yet implemented");
      }
      delete data.profile;
    }
    if (data.posts) {
      if (data.posts.create) {
        await this.client.post.createMany(
          {
            data: convertToArray(data.posts.create).map((createData) => ({
              ...createData,
              authorId: data.id!,
            })),
          },
          tx,
        );
      }
      if (data.posts.connectOrCreate) {
        throw new Error("connectOrCreate not yet implemented");
      }
      if (data.posts.createMany) {
        await this.client.post.createMany(
          {
            data: convertToArray(data.posts.createMany.data).map((createData) => ({
              ...createData,
              authorId: data.id!,
            })),
          },
          tx,
        );
      }
      delete data.posts;
    }
  }

  async _nestedCreate<Q extends Prisma.Args<Prisma.UserDelegate, "create">>(
    query: Q,
    tx: CreateTransactionType,
  ): Promise<PrismaIDBSchema["User"]["key"]> {
    await this._performNestedCreates(query.data, tx);
    const record = await this._fillDefaults(query.data, tx);
    const keyPath = await tx.objectStore("User").add(record);
    return keyPath;
  }

  async findMany<Q extends Prisma.Args<Prisma.UserDelegate, "findMany">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findMany">> {
    const records = await this._applyWhereClause(await this.client._db.getAll("User"), query?.where);
    const relationAppliedRecords = (await this._applyRelations(records, query)) as Prisma.Result<
      Prisma.UserDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    return selectAppliedRecords as Prisma.Result<Prisma.UserDelegate, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<Prisma.UserDelegate, "findFirst">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findFirst">> {
    return (await this.findMany(query))[0];
  }

  async findFirstOrThrow<Q extends Prisma.Args<Prisma.UserDelegate, "findFirstOrThrow">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">> {
    const record = await this.findFirst(query);
    if (!record) throw new Error("Record not found");
    return record;
  }

  async findUnique<Q extends Prisma.Args<Prisma.UserDelegate, "findUnique">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findUnique">> {
    let record;
    if (query.where.id) {
      record = await this.client._db.get("User", [query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where), query),
      query.select,
    )[0];
    return recordWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "findUnique">;
  }

  async count<Q extends Prisma.Args<Prisma.UserDelegate, "count">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "count">> {
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where });
      return records.length as Prisma.Result<Prisma.UserDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.UserCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } })).length;
    }
    return result as Prisma.Result<Prisma.UserDelegate, Q, "count">;
  }

  async create<Q extends Prisma.Args<Prisma.UserDelegate, "create">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "create">> {
    const record = await this._fillDefaults(query.data);
    let keyPath: PrismaIDBSchema["User"]["key"];
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    if (storesNeeded.size === 0) {
      keyPath = await this.client._db.add("User", record);
    } else {
      const tx = this.client._db.transaction(["User", ...Array.from(storesNeeded)], "readwrite");
      await this._performNestedCreates(query.data, tx);
      keyPath = await tx.objectStore("User").add(this._removeNestedCreateData(record));
      tx.commit();
    }
    const data = (await this.client._db.get("User", keyPath))!;
    const recordsWithRelations = this._applySelectClause(await this._applyRelations([data], query), query.select)[0];
    return recordsWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "create">;
  }

  async createMany<Q extends Prisma.Args<Prisma.UserDelegate, "createMany">>(
    query: Q,
    tx?: CreateTransactionType,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "createMany">> {
    const createManyData = convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["User"], "readwrite");
    for (const createData of createManyData) {
      const record = await this._fillDefaults(createData, tx);
      await tx.objectStore("User").add(record);
    }
    return { count: createManyData.length };
  }
}

class ProfileIDBClass extends BaseIDBModelClass {
  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.ProfileDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W): Promise<R[]> {
    if (!whereClause) return records;
    return records.filter((record) => {
      const stringFields = ["bio"] as const;
      for (const field of stringFields) {
        if (!whereStringFilter(record, field, whereClause[field])) return false;
      }
      const intFields = ["id", "userId"] as const;
      for (const field of intFields) {
        if (!whereIntFilter(record, field, whereClause[field])) return false;
      }
      return true;
    });
  }

  private _applySelectClause<S extends Prisma.Args<Prisma.ProfileDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.ProfileDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.ProfileDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of ["id", "bio", "user", "userId"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.ProfileDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async _applyRelations<Q extends Prisma.Args<Prisma.ProfileDelegate, "findMany">>(
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

  private async _fillDefaults<D extends Prisma.Args<Prisma.ProfileDelegate, "create">["data"]>(
    data: D,
    tx?: CreateTransactionType,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow">> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.id === undefined) {
      const transaction = tx ?? this.client._db.transaction(["Profile"], "readwrite");
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

  private _removeNestedCreateData<D extends Prisma.Args<Prisma.ProfileDelegate, "create">["data"]>(data: D) {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate.user;
    return recordWithoutNestedCreate;
  }

  private async _performNestedCreates<D extends Prisma.Args<Prisma.ProfileDelegate, "create">["data"]>(
    data: D,
    tx: CreateTransactionType,
  ) {
    if (data.user) {
      let fk;
      if (data.user.create) {
        fk = (await this.client.user._nestedCreate({ data: data.user.create }, tx))[0];
      }
      if (data.user.connectOrCreate) {
        throw new Error("connectOrCreate not yet implemented");
      }
      const unsafeData = data as Record<string, unknown>;
      unsafeData.userId = fk as NonNullable<typeof fk>;
      delete unsafeData.user;
    }
  }

  async _nestedCreate<Q extends Prisma.Args<Prisma.ProfileDelegate, "create">>(
    query: Q,
    tx: CreateTransactionType,
  ): Promise<PrismaIDBSchema["Profile"]["key"]> {
    await this._performNestedCreates(query.data, tx);
    const record = await this._fillDefaults(query.data, tx);
    const keyPath = await tx.objectStore("Profile").add(record);
    return keyPath;
  }

  async findMany<Q extends Prisma.Args<Prisma.ProfileDelegate, "findMany">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findMany">> {
    const records = await this._applyWhereClause(await this.client._db.getAll("Profile"), query?.where);
    const relationAppliedRecords = (await this._applyRelations(records, query)) as Prisma.Result<
      Prisma.ProfileDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    return selectAppliedRecords as Prisma.Result<Prisma.ProfileDelegate, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<Prisma.ProfileDelegate, "findFirst">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findFirst">> {
    return (await this.findMany(query))[0];
  }

  async findFirstOrThrow<Q extends Prisma.Args<Prisma.ProfileDelegate, "findFirstOrThrow">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findFirstOrThrow">> {
    const record = await this.findFirst(query);
    if (!record) throw new Error("Record not found");
    return record;
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

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where), query),
      query.select,
    )[0];
    return recordWithRelations as Prisma.Result<Prisma.ProfileDelegate, Q, "findUnique">;
  }

  async count<Q extends Prisma.Args<Prisma.ProfileDelegate, "count">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "count">> {
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where });
      return records.length as Prisma.Result<Prisma.ProfileDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.ProfileCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } })).length;
    }
    return result as Prisma.Result<Prisma.UserDelegate, Q, "count">;
  }

  async create<Q extends Prisma.Args<Prisma.ProfileDelegate, "create">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "create">> {
    const record = await this._fillDefaults(query.data);
    let keyPath: PrismaIDBSchema["Profile"]["key"];
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    if (storesNeeded.size === 0) {
      keyPath = await this.client._db.add("Profile", record);
    } else {
      const tx = this.client._db.transaction(["Profile", ...Array.from(storesNeeded)], "readwrite");
      await this._performNestedCreates(query.data, tx);
      keyPath = await tx.objectStore("Profile").add(this._removeNestedCreateData(record));
      tx.commit();
    }
    const data = (await this.client._db.get("Profile", keyPath))!;
    const recordsWithRelations = this._applySelectClause(await this._applyRelations([data], query), query.select)[0];
    return recordsWithRelations as Prisma.Result<Prisma.ProfileDelegate, Q, "create">;
  }

  async createMany<Q extends Prisma.Args<Prisma.ProfileDelegate, "createMany">>(
    query: Q,
    tx?: CreateTransactionType,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "createMany">> {
    const createManyData = convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["Profile"], "readwrite");
    for (const createData of createManyData) {
      const record = await this._fillDefaults(createData, tx);
      await tx.objectStore("Profile").add(record);
    }
    return { count: createManyData.length };
  }
}

class PostIDBClass extends BaseIDBModelClass {
  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.PostDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W): Promise<R[]> {
    if (!whereClause) return records;
    return records.filter((record) => {
      const stringFields = ["title"] as const;
      for (const field of stringFields) {
        if (!whereStringFilter(record, field, whereClause[field])) return false;
      }
      const intFields = ["id", "authorId"] as const;
      for (const field of intFields) {
        if (!whereIntFilter(record, field, whereClause[field])) return false;
      }
      return true;
    });
  }

  private _applySelectClause<S extends Prisma.Args<Prisma.PostDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.PostDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.PostDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of ["id", "title", "author", "authorId"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.PostDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async _applyRelations<Q extends Prisma.Args<Prisma.PostDelegate, "findMany">>(
    records: Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow">[],
    query?: Q,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.PostDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_author = query.select?.author || query.include?.author;
      if (attach_author) {
        unsafeRecord["author"] = await this.client.user.findUnique({
          ...(attach_author === true ? {} : attach_author),
          where: { id: record.authorId },
        });
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.PostDelegate, Q, "findFirstOrThrow">[];
  }

  private async _fillDefaults<D extends Prisma.Args<Prisma.PostDelegate, "create">["data"]>(
    data: D,
    tx?: CreateTransactionType,
  ): Promise<Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow">> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.id === undefined) {
      const transaction = tx ?? this.client._db.transaction(["Post"], "readwrite");
      const store = transaction.objectStore("Post");
      const cursor = await store.openCursor(null, "prev");
      data.id = cursor ? Number(cursor.key) + 1 : 1;
    }
    return data as Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow">;
  }

  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.PostDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    if (data.author) {
      neededStores.add("User");
      if (data.author.create) {
        convertToArray(data.author.create).forEach((record) =>
          this.client.user._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.author.connectOrCreate) {
        convertToArray(data.author.connectOrCreate).forEach((record) =>
          this.client.user._getNeededStoresForCreate(record.create).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    return neededStores;
  }

  private _removeNestedCreateData<D extends Prisma.Args<Prisma.PostDelegate, "create">["data"]>(data: D) {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate.author;
    return recordWithoutNestedCreate;
  }

  private async _performNestedCreates<D extends Prisma.Args<Prisma.PostDelegate, "create">["data"]>(
    data: D,
    tx: CreateTransactionType,
  ) {
    if (data.author) {
      let fk;
      if (data.author.create) {
        fk = (await this.client.user._nestedCreate({ data: data.author.create }, tx))[0];
      }
      if (data.author.connectOrCreate) {
        throw new Error("connectOrCreate not yet implemented");
      }
      const unsafeData = data as Record<string, unknown>;
      unsafeData.userId = fk as NonNullable<typeof fk>;
      delete unsafeData.author;
    }
  }

  async _nestedCreate<Q extends Prisma.Args<Prisma.PostDelegate, "create">>(
    query: Q,
    tx: CreateTransactionType,
  ): Promise<PrismaIDBSchema["Post"]["key"]> {
    await this._performNestedCreates(query.data, tx);
    const record = await this._fillDefaults(query.data, tx);
    const keyPath = await tx.objectStore("Post").add(record);
    return keyPath;
  }

  async findMany<Q extends Prisma.Args<Prisma.PostDelegate, "findMany">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findMany">> {
    const records = await this._applyWhereClause(await this.client._db.getAll("Post"), query?.where);
    const relationAppliedRecords = (await this._applyRelations(records, query)) as Prisma.Result<
      Prisma.PostDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    return selectAppliedRecords as Prisma.Result<Prisma.PostDelegate, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<Prisma.PostDelegate, "findFirst">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findFirst">> {
    return (await this.findMany(query))[0];
  }

  async findFirstOrThrow<Q extends Prisma.Args<Prisma.PostDelegate, "findFirstOrThrow">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findFirstOrThrow">> {
    const record = await this.findFirst(query);
    if (!record) throw new Error("Record not found");
    return record;
  }

  async findUnique<Q extends Prisma.Args<Prisma.PostDelegate, "findUnique">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findUnique">> {
    let record;
    if (query.where.id) {
      record = await this.client._db.get("Post", [query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where), query),
      query.select,
    )[0];
    return recordWithRelations as Prisma.Result<Prisma.PostDelegate, Q, "findUnique">;
  }

  async count<Q extends Prisma.Args<Prisma.PostDelegate, "count">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "count">> {
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where });
      return records.length as Prisma.Result<Prisma.PostDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.PostCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } })).length;
    }
    return result as Prisma.Result<Prisma.UserDelegate, Q, "count">;
  }

  async create<Q extends Prisma.Args<Prisma.PostDelegate, "create">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "create">> {
    const record = await this._fillDefaults(query.data);
    let keyPath: PrismaIDBSchema["Post"]["key"];
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    if (storesNeeded.size === 0) {
      keyPath = await this.client._db.add("Post", record);
    } else {
      const tx = this.client._db.transaction(["Post", ...Array.from(storesNeeded)], "readwrite");
      await this._performNestedCreates(query.data, tx);
      keyPath = await tx.objectStore("Post").add(this._removeNestedCreateData(record));
      tx.commit();
    }
    const data = (await this.client._db.get("Post", keyPath))!;
    const recordsWithRelations = this._applySelectClause(await this._applyRelations([data], query), query.select)[0];
    return recordsWithRelations as Prisma.Result<Prisma.PostDelegate, Q, "create">;
  }

  async createMany<Q extends Prisma.Args<Prisma.PostDelegate, "createMany">>(
    query: Q,
    tx?: CreateTransactionType,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "createMany">> {
    const createManyData = convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["Post"], "readwrite");
    for (const createData of createManyData) {
      const record = await this._fillDefaults(createData, tx);
      await tx.objectStore("Post").add(record);
    }
    return { count: createManyData.length };
  }
}
