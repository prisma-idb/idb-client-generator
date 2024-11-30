import type { Prisma } from "@prisma/client";
import type { IDBPDatabase, StoreNames } from "idb";
import { openDB } from "idb";
import type { PrismaIDBSchema } from "./idb-interface";
import * as IDBUtils from "./idb-utils";

/* eslint-disable @typescript-eslint/no-unused-vars */
const IDB_VERSION = 1;

export class PrismaIDBClient {
  private static instance: PrismaIDBClient;
  _db!: IDBPDatabase<PrismaIDBSchema>;

  private constructor() {}

  user!: UserIDBClass;
  profile!: ProfileIDBClass;
  post!: PostIDBClass;
  allFieldScalarTypes!: AllFieldScalarTypesIDBClass;

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
        db.createObjectStore("AllFieldScalarTypes", { keyPath: ["id"] });
      },
    });
    this.user = new UserIDBClass(this, ["id"]);
    this.profile = new ProfileIDBClass(this, ["id"]);
    this.post = new PostIDBClass(this, ["id"]);
    this.allFieldScalarTypes = new AllFieldScalarTypesIDBClass(this, ["id"]);
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
  private _applyWhereClause<
    W extends Prisma.Args<Prisma.UserDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W): R[] {
    if (!whereClause) return records;
    return records.filter((record) => {
      const stringFields = ["name"] as const;
      for (const field of stringFields) {
        if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return false;
      }
      const numberFields = ["id"] as const;
      for (const field of numberFields) {
        if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return false;
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
    tx: IDBUtils.ReadonlyTransactionType | IDBUtils.ReadwriteTransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_profile = query.select?.profile || query.include?.profile;
      if (attach_profile) {
        unsafeRecord["profile"] = await this.client.profile.findUnique(
          {
            ...(attach_profile === true ? {} : attach_profile),
            where: { userId: record.id },
          },
          tx,
        );
      }
      const attach_posts = query.select?.posts || query.include?.posts;
      if (attach_posts) {
        unsafeRecord["posts"] = await this.client.post.findMany(
          {
            ...(attach_posts === true ? {} : attach_posts),
            where: { authorId: record.id },
          },
          tx,
        );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">[];
  }

  private async _fillDefaults<D extends Prisma.Args<Prisma.UserDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as D;
    if (data.id === undefined) {
      const transaction = tx ?? this.client._db.transaction(["User"], "readwrite");
      const store = transaction.objectStore("User");
      const cursor = await store.openCursor(null, "prev");
      data.id = cursor ? Number(cursor.key) + 1 : 1;
    }
    return data;
  }

  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.UserDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("User");
    if (query?.select?.profile || query?.include?.profile) {
      neededStores.add("Profile");
    }
    if (query?.select?.posts || query?.include?.posts) {
      neededStores.add("Post");
    }
    return neededStores;
  }

  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.UserDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("User");
    if (data.profile) {
      neededStores.add("Profile");
      if (data.profile.create) {
        IDBUtils.convertToArray(data.profile.create).forEach((record) =>
          this.client.profile._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.profile.connectOrCreate) {
        IDBUtils.convertToArray(data.profile.connectOrCreate).forEach((record) =>
          this.client.profile
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data.posts) {
      neededStores.add("Post");
      if (data.posts.create) {
        IDBUtils.convertToArray(data.posts.create).forEach((record) =>
          this.client.post._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.posts.connectOrCreate) {
        IDBUtils.convertToArray(data.posts.connectOrCreate).forEach((record) =>
          this.client.post._getNeededStoresForCreate(record.create).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.posts.createMany) {
        IDBUtils.convertToArray(data.posts.createMany.data).forEach((record) =>
          this.client.post._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    return neededStores;
  }

  private _removeNestedCreateData<D extends Prisma.Args<Prisma.UserDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate.profile;
    delete recordWithoutNestedCreate.posts;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">;
  }

  private async _performNestedCreates<D extends Prisma.Args<Prisma.UserDelegate, "create">["data"]>(
    data: D,
    tx: IDBUtils.ReadwriteTransactionType,
    validateFKs = true,
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
            data: IDBUtils.convertToArray(data.posts.create).map((createData) => ({
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
            data: IDBUtils.convertToArray(data.posts.createMany.data).map((createData) => ({
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
    tx: IDBUtils.ReadwriteTransactionType,
  ): Promise<PrismaIDBSchema["User"]["key"]> {
    await this._performNestedCreates(query.data, tx, false);
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("User").add(record);
    return keyPath;
  }

  async findMany<Q extends Prisma.Args<Prisma.UserDelegate, "findMany">>(
    query?: Q,
    tx?: IDBUtils.ReadonlyTransactionType | IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findMany">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = this._applyWhereClause(await tx.objectStore("User").getAll(), query?.where);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
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
    tx?: IDBUtils.ReadonlyTransactionType | IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findUnique">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id) {
      record = await tx.objectStore("User").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(this._applyWhereClause([record], query.where), tx, query),
      query.select,
    )[0];
    return recordWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "findUnique">;
  }

  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.UserDelegate, "findUniqueOrThrow">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findUniqueOrThrow">> {
    const record = await this.findUnique(query);
    if (!record) throw new Error("Record not found");
    return record;
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
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "create">> {
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this._fillDefaults(query.data, tx);
    await this._performNestedCreates(record, tx);
    const keyPath = await tx.objectStore("User").add(this._removeNestedCreateData(query.data));

    const data = (await tx.objectStore("User").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations([data], tx, query),
      query.select,
    )[0];
    return recordsWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "create">;
  }

  async createMany<Q extends Prisma.Args<Prisma.UserDelegate, "createMany">>(
    query: Q,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "createMany">> {
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["User"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      await tx.objectStore("User").add(record);
    }
    return { count: createManyData.length };
  }

  async createManyAndReturn<Q extends Prisma.Args<Prisma.UserDelegate, "createManyAndReturn">>(
    query: Q,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "createManyAndReturn">> {
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: unknown[] = [];
    tx = tx ?? this.client._db.transaction(["User"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      await tx.objectStore("User").add(record);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    return records as Prisma.Result<Prisma.UserDelegate, Q, "createManyAndReturn">;
  }

  async update<Q extends Prisma.Args<Prisma.UserDelegate, "update">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "update">> {
    const record = await this.findUnique({ where: query.where });
    if (record === null) {
      throw new Error("Record not found");
    }
    const stringFields = ["name"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const keyPath = await this.client._db.put("User", record);
    const recordWithRelations = (await this.findUnique({
      ...query,
      where: { id: keyPath[0] },
    }))!;
    return recordWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "update">;
  }
}

class ProfileIDBClass extends BaseIDBModelClass {
  private _applyWhereClause<
    W extends Prisma.Args<Prisma.ProfileDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W): R[] {
    if (!whereClause) return records;
    return records.filter((record) => {
      const stringFields = ["bio"] as const;
      for (const field of stringFields) {
        if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return false;
      }
      const numberFields = ["id", "userId"] as const;
      for (const field of numberFields) {
        if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return false;
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
    tx: IDBUtils.ReadonlyTransactionType | IDBUtils.ReadwriteTransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.ProfileDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_user = query.select?.user || query.include?.user;
      if (attach_user) {
        unsafeRecord["user"] = await this.client.user.findUnique(
          {
            ...(attach_user === true ? {} : attach_user),
            where: { id: record.userId },
          },
          tx,
        );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.ProfileDelegate, Q, "findFirstOrThrow">[];
  }

  private async _fillDefaults<D extends Prisma.Args<Prisma.ProfileDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as D;
    if (data.id === undefined) {
      const transaction = tx ?? this.client._db.transaction(["Profile"], "readwrite");
      const store = transaction.objectStore("Profile");
      const cursor = await store.openCursor(null, "prev");
      data.id = cursor ? Number(cursor.key) + 1 : 1;
    }
    if (data.bio === undefined) {
      data.bio = null;
    }
    return data;
  }

  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.ProfileDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Profile");
    if (query?.select?.user || query?.include?.user) {
      neededStores.add("User");
    }
    return neededStores;
  }

  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.ProfileDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Profile");
    if (data.user) {
      neededStores.add("User");
      if (data.user.create) {
        IDBUtils.convertToArray(data.user.create).forEach((record) =>
          this.client.user._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.user.connectOrCreate) {
        IDBUtils.convertToArray(data.user.connectOrCreate).forEach((record) =>
          this.client.user._getNeededStoresForCreate(record.create).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data.userId !== undefined) {
      neededStores.add("User");
    }
    return neededStores;
  }

  private _removeNestedCreateData<D extends Prisma.Args<Prisma.ProfileDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate.user;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow">;
  }

  private async _performNestedCreates<D extends Prisma.Args<Prisma.ProfileDelegate, "create">["data"]>(
    data: D,
    tx: IDBUtils.ReadwriteTransactionType,
    validateFKs = true,
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
    if (validateFKs && (data.userId !== undefined || data.user?.connect?.id !== undefined)) {
      const fk = data.userId ?? (data.user?.connect?.id as number);
      const record = await tx.objectStore("User").getKey([fk]);
      if (record === undefined) {
        throw new Error(`Foreign key (${data.userId}) for model (User) does not exist`);
      }
    }
  }

  async _nestedCreate<Q extends Prisma.Args<Prisma.ProfileDelegate, "create">>(
    query: Q,
    tx: IDBUtils.ReadwriteTransactionType,
  ): Promise<PrismaIDBSchema["Profile"]["key"]> {
    await this._performNestedCreates(query.data, tx, false);
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("Profile").add(record);
    return keyPath;
  }

  async findMany<Q extends Prisma.Args<Prisma.ProfileDelegate, "findMany">>(
    query?: Q,
    tx?: IDBUtils.ReadonlyTransactionType | IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findMany">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = this._applyWhereClause(await tx.objectStore("Profile").getAll(), query?.where);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
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
    tx?: IDBUtils.ReadonlyTransactionType | IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findUnique">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id) {
      record = await tx.objectStore("Profile").get([query.where.id]);
    } else if (query.where.userId) {
      record = await tx.objectStore("Profile").index("userIdIndex").get([query.where.userId]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(this._applyWhereClause([record], query.where), tx, query),
      query.select,
    )[0];
    return recordWithRelations as Prisma.Result<Prisma.ProfileDelegate, Q, "findUnique">;
  }

  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.ProfileDelegate, "findUniqueOrThrow">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findUniqueOrThrow">> {
    const record = await this.findUnique(query);
    if (!record) throw new Error("Record not found");
    return record;
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
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "create">> {
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this._fillDefaults(query.data, tx);
    await this._performNestedCreates(record, tx);
    const keyPath = await tx.objectStore("Profile").add(this._removeNestedCreateData(query.data));

    const data = (await tx.objectStore("Profile").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations([data], tx, query),
      query.select,
    )[0];
    return recordsWithRelations as Prisma.Result<Prisma.ProfileDelegate, Q, "create">;
  }

  async createMany<Q extends Prisma.Args<Prisma.ProfileDelegate, "createMany">>(
    query: Q,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "createMany">> {
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["Profile"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      await tx.objectStore("Profile").add(record);
    }
    return { count: createManyData.length };
  }

  async createManyAndReturn<Q extends Prisma.Args<Prisma.ProfileDelegate, "createManyAndReturn">>(
    query: Q,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "createManyAndReturn">> {
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: unknown[] = [];
    tx = tx ?? this.client._db.transaction(["Profile"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      await tx.objectStore("Profile").add(record);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    return records as Prisma.Result<Prisma.ProfileDelegate, Q, "createManyAndReturn">;
  }

  async update<Q extends Prisma.Args<Prisma.ProfileDelegate, "update">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "update">> {
    const record = await this.findUnique({ where: query.where });
    if (record === null) {
      throw new Error("Record not found");
    }
    const stringFields = ["bio"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const keyPath = await this.client._db.put("Profile", record);
    const recordWithRelations = (await this.findUnique({
      ...query,
      where: { id: keyPath[0] },
    }))!;
    return recordWithRelations as Prisma.Result<Prisma.ProfileDelegate, Q, "update">;
  }
}

class PostIDBClass extends BaseIDBModelClass {
  private _applyWhereClause<
    W extends Prisma.Args<Prisma.PostDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W): R[] {
    if (!whereClause) return records;
    return records.filter((record) => {
      const stringFields = ["title"] as const;
      for (const field of stringFields) {
        if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return false;
      }
      const numberFields = ["id", "authorId"] as const;
      for (const field of numberFields) {
        if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return false;
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
    tx: IDBUtils.ReadonlyTransactionType | IDBUtils.ReadwriteTransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.PostDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_author = query.select?.author || query.include?.author;
      if (attach_author) {
        unsafeRecord["author"] =
          record.authorId === null
            ? null
            : await this.client.user.findUnique(
                {
                  ...(attach_author === true ? {} : attach_author),
                  where: { id: record.authorId },
                },
                tx,
              );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.PostDelegate, Q, "findFirstOrThrow">[];
  }

  private async _fillDefaults<D extends Prisma.Args<Prisma.PostDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as D;
    if (data.id === undefined) {
      const transaction = tx ?? this.client._db.transaction(["Post"], "readwrite");
      const store = transaction.objectStore("Post");
      const cursor = await store.openCursor(null, "prev");
      data.id = cursor ? Number(cursor.key) + 1 : 1;
    }
    if (data.authorId === undefined) {
      data.authorId = null;
    }
    return data;
  }

  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.PostDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Post");
    if (query?.select?.author || query?.include?.author) {
      neededStores.add("User");
    }
    return neededStores;
  }

  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.PostDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Post");
    if (data.author) {
      neededStores.add("User");
      if (data.author.create) {
        IDBUtils.convertToArray(data.author.create).forEach((record) =>
          this.client.user._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.author.connectOrCreate) {
        IDBUtils.convertToArray(data.author.connectOrCreate).forEach((record) =>
          this.client.user._getNeededStoresForCreate(record.create).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data.authorId !== undefined) {
      neededStores.add("User");
    }
    return neededStores;
  }

  private _removeNestedCreateData<D extends Prisma.Args<Prisma.PostDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate.author;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow">;
  }

  private async _performNestedCreates<D extends Prisma.Args<Prisma.PostDelegate, "create">["data"]>(
    data: D,
    tx: IDBUtils.ReadwriteTransactionType,
    validateFKs = true,
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
    if (validateFKs && (data.authorId !== undefined || data.author?.connect?.id !== undefined)) {
      const fk = data.authorId ?? (data.author?.connect?.id as number);
      const record = await tx.objectStore("User").getKey([fk]);
      if (record === undefined) {
        throw new Error(`Foreign key (${data.authorId}) for model (User) does not exist`);
      }
    }
  }

  async _nestedCreate<Q extends Prisma.Args<Prisma.PostDelegate, "create">>(
    query: Q,
    tx: IDBUtils.ReadwriteTransactionType,
  ): Promise<PrismaIDBSchema["Post"]["key"]> {
    await this._performNestedCreates(query.data, tx, false);
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("Post").add(record);
    return keyPath;
  }

  async findMany<Q extends Prisma.Args<Prisma.PostDelegate, "findMany">>(
    query?: Q,
    tx?: IDBUtils.ReadonlyTransactionType | IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findMany">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = this._applyWhereClause(await tx.objectStore("Post").getAll(), query?.where);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
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
    tx?: IDBUtils.ReadonlyTransactionType | IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findUnique">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id) {
      record = await tx.objectStore("Post").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(this._applyWhereClause([record], query.where), tx, query),
      query.select,
    )[0];
    return recordWithRelations as Prisma.Result<Prisma.PostDelegate, Q, "findUnique">;
  }

  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.PostDelegate, "findUniqueOrThrow">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findUniqueOrThrow">> {
    const record = await this.findUnique(query);
    if (!record) throw new Error("Record not found");
    return record;
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
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "create">> {
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this._fillDefaults(query.data, tx);
    await this._performNestedCreates(record, tx);
    const keyPath = await tx.objectStore("Post").add(this._removeNestedCreateData(query.data));

    const data = (await tx.objectStore("Post").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations([data], tx, query),
      query.select,
    )[0];
    return recordsWithRelations as Prisma.Result<Prisma.PostDelegate, Q, "create">;
  }

  async createMany<Q extends Prisma.Args<Prisma.PostDelegate, "createMany">>(
    query: Q,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "createMany">> {
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["Post"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      await tx.objectStore("Post").add(record);
    }
    return { count: createManyData.length };
  }

  async createManyAndReturn<Q extends Prisma.Args<Prisma.PostDelegate, "createManyAndReturn">>(
    query: Q,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "createManyAndReturn">> {
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: unknown[] = [];
    tx = tx ?? this.client._db.transaction(["Post"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      await tx.objectStore("Post").add(record);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    return records as Prisma.Result<Prisma.PostDelegate, Q, "createManyAndReturn">;
  }

  async update<Q extends Prisma.Args<Prisma.PostDelegate, "update">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "update">> {
    const record = await this.findUnique({ where: query.where });
    if (record === null) {
      throw new Error("Record not found");
    }
    const stringFields = ["title"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const keyPath = await this.client._db.put("Post", record);
    const recordWithRelations = (await this.findUnique({
      ...query,
      where: { id: keyPath[0] },
    }))!;
    return recordWithRelations as Prisma.Result<Prisma.PostDelegate, Q, "update">;
  }
}

class AllFieldScalarTypesIDBClass extends BaseIDBModelClass {
  private _applyWhereClause<
    W extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.AllFieldScalarTypesDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W): R[] {
    if (!whereClause) return records;
    return records.filter((record) => {
      const stringFields = ["string"] as const;
      for (const field of stringFields) {
        if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return false;
      }
      const numberFields = ["id", "int", "float"] as const;
      for (const field of numberFields) {
        if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return false;
      }
      const bigIntFields = ["bigInt"] as const;
      for (const field of bigIntFields) {
        if (!IDBUtils.whereBigIntFilter(record, field, whereClause[field])) return false;
      }
      const booleanFields = ["boolean"] as const;
      for (const field of booleanFields) {
        if (!IDBUtils.whereBoolFilter(record, field, whereClause[field])) return false;
      }
      const bytesFields = ["bytes"] as const;
      for (const field of bytesFields) {
        if (!IDBUtils.whereBytesFilter(record, field, whereClause[field])) return false;
      }
      const dateTimeFields = ["dateTime"] as const;
      for (const field of dateTimeFields) {
        if (!IDBUtils.whereDateTimeFilter(record, field, whereClause[field])) return false;
      }
      return true;
    });
  }

  private _applySelectClause<S extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.AllFieldScalarTypesDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.AllFieldScalarTypesDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of [
        "id",
        "string",
        "boolean",
        "int",
        "bigInt",
        "float",
        "decimal",
        "dateTime",
        "json",
        "bytes",
      ]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async _applyRelations<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findMany">>(
    records: Prisma.Result<Prisma.AllFieldScalarTypesDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.ReadonlyTransactionType | IDBUtils.ReadwriteTransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<
      Prisma.AllFieldScalarTypesDelegate,
      Q,
      "findFirstOrThrow"
    >[];
  }

  private async _fillDefaults<D extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as D;
    if (data.id === undefined) {
      const transaction = tx ?? this.client._db.transaction(["AllFieldScalarTypes"], "readwrite");
      const store = transaction.objectStore("AllFieldScalarTypes");
      const cursor = await store.openCursor(null, "prev");
      data.id = cursor ? Number(cursor.key) + 1 : 1;
    }
    if (typeof data.bigInt === "number") {
      data.bigInt = BigInt(data.bigInt);
    }
    if (typeof data.dateTime === "string") {
      data.dateTime = new Date(data.dateTime);
    }
    return data;
  }

  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("AllFieldScalarTypes");
    return neededStores;
  }

  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("AllFieldScalarTypes");
    return neededStores;
  }

  private _removeNestedCreateData<D extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.AllFieldScalarTypesDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    return recordWithoutNestedCreate as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, object, "findFirstOrThrow">;
  }

  private async _performNestedCreates<D extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "create">["data"]>(
    data: D,
    tx: IDBUtils.ReadwriteTransactionType,
    validateFKs = true,
  ) {}

  async _nestedCreate<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "create">>(
    query: Q,
    tx: IDBUtils.ReadwriteTransactionType,
  ): Promise<PrismaIDBSchema["AllFieldScalarTypes"]["key"]> {
    await this._performNestedCreates(query.data, tx, false);
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("AllFieldScalarTypes").add(record);
    return keyPath;
  }

  async findMany<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findMany">>(
    query?: Q,
    tx?: IDBUtils.ReadonlyTransactionType | IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findMany">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = this._applyWhereClause(await tx.objectStore("AllFieldScalarTypes").getAll(), query?.where);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.AllFieldScalarTypesDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    return selectAppliedRecords as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findFirst">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findFirst">> {
    return (await this.findMany(query))[0];
  }

  async findFirstOrThrow<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findFirstOrThrow">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findFirstOrThrow">> {
    const record = await this.findFirst(query);
    if (!record) throw new Error("Record not found");
    return record;
  }

  async findUnique<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findUnique">>(
    query: Q,
    tx?: IDBUtils.ReadonlyTransactionType | IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findUnique">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id) {
      record = await tx.objectStore("AllFieldScalarTypes").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(this._applyWhereClause([record], query.where), tx, query),
      query.select,
    )[0];
    return recordWithRelations as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findUnique">;
  }

  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findUniqueOrThrow">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findUniqueOrThrow">> {
    const record = await this.findUnique(query);
    if (!record) throw new Error("Record not found");
    return record;
  }

  async count<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "count">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "count">> {
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where });
      return records.length as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.AllFieldScalarTypesCountAggregateInputType, number>> = {};
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

  async create<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "create">>(
    query: Q,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "create">> {
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this._fillDefaults(query.data, tx);
    await this._performNestedCreates(record, tx);
    const keyPath = await tx.objectStore("AllFieldScalarTypes").add(this._removeNestedCreateData(query.data));

    const data = (await tx.objectStore("AllFieldScalarTypes").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations([data], tx, query),
      query.select,
    )[0];
    return recordsWithRelations as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "create">;
  }

  async createMany<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "createMany">>(
    query: Q,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "createMany">> {
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["AllFieldScalarTypes"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      await tx.objectStore("AllFieldScalarTypes").add(record);
    }
    return { count: createManyData.length };
  }

  async createManyAndReturn<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "createManyAndReturn">>(
    query: Q,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "createManyAndReturn">> {
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: unknown[] = [];
    tx = tx ?? this.client._db.transaction(["AllFieldScalarTypes"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      await tx.objectStore("AllFieldScalarTypes").add(record);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    return records as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "createManyAndReturn">;
  }

  async update<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "update">>(
    query: Q,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "update">> {
    const record = await this.findUnique({ where: query.where });
    if (record === null) {
      throw new Error("Record not found");
    }
    const stringFields = ["string"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const dateTimeFields = ["dateTime"] as const;
    for (const field of dateTimeFields) {
      IDBUtils.handleDateTimeUpdateField(record, field, query.data[field]);
    }
    const booleanFields = ["boolean"] as const;
    for (const field of booleanFields) {
      IDBUtils.handleBooleanUpdateField(record, field, query.data[field]);
    }
    const bytesFields = ["bytes"] as const;
    for (const field of bytesFields) {
      IDBUtils.handleBytesUpdateField(record, field, query.data[field]);
    }
    const keyPath = await this.client._db.put("AllFieldScalarTypes", record);
    const recordWithRelations = (await this.findUnique({
      ...query,
      where: { id: keyPath[0] },
    }))!;
    return recordWithRelations as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "update">;
  }
}
