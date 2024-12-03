import { createId } from "@paralleldrive/cuid2";
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
  comment!: CommentIDBClass;
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
        db.createObjectStore("Comment", { keyPath: ["id"] });
        db.createObjectStore("AllFieldScalarTypes", { keyPath: ["id"] });
      },
    });
    this.user = new UserIDBClass(this, ["id"]);
    this.profile = new ProfileIDBClass(this, ["id"]);
    this.post = new PostIDBClass(this, ["id"]);
    this.comment = new CommentIDBClass(this, ["id"]);
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
  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.UserDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.UserDelegate, R, W>(
      records,
      whereClause,
      tx,
      this.keyPath,
      this._applyWhereClause.bind(this),
    );
    return (
      await Promise.all(
        records.map(async (record) => {
          const stringFields = ["name"] as const;
          for (const field of stringFields) {
            if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;
          }
          const numberFields = ["id"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          if (whereClause.profile === null) {
            const relatedRecord = await this.client.profile.findFirst({ where: { userId: record.id } }, tx);
            if (relatedRecord) return null;
          }
          if (whereClause.profile) {
            const { is, isNot, ...rest } = whereClause.profile;
            if (is === null) {
              const relatedRecord = await this.client.profile.findFirst({ where: { userId: record.id } }, tx);
              if (relatedRecord) return null;
            }
            if (is !== null && is !== undefined) {
              const relatedRecord = await this.client.profile.findFirst({ where: { ...is, userId: record.id } }, tx);
              if (!relatedRecord) return null;
            }
            if (isNot === null) {
              const relatedRecord = await this.client.profile.findFirst({ where: { userId: record.id } }, tx);
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.profile.findFirst({ where: { ...isNot, userId: record.id } }, tx);
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              if (record.id === null) return null;
              const relatedRecord = await this.client.profile.findFirst(
                { where: { ...whereClause.profile, userId: record.id } },
                tx,
              );
              if (!relatedRecord) return null;
            }
          }
          if (whereClause.posts) {
            if (whereClause.posts.every) {
              const violatingRecord = await this.client.post.findFirst({
                where: { NOT: { ...whereClause.posts.every }, authorId: record.id },
                tx,
              });
              if (violatingRecord !== null) return null;
            }
            if (whereClause.posts.some) {
              const relatedRecords = await this.client.post.findMany({
                where: { ...whereClause.posts.some, authorId: record.id },
                tx,
              });
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.posts.none) {
              const violatingRecord = await this.client.post.findFirst({
                where: { ...whereClause.posts.none, authorId: record.id },
                tx,
              });
              if (violatingRecord !== null) return null;
            }
          }
          if (whereClause.comments) {
            if (whereClause.comments.every) {
              const violatingRecord = await this.client.comment.findFirst({
                where: { NOT: { ...whereClause.comments.every }, userId: record.id },
                tx,
              });
              if (violatingRecord !== null) return null;
            }
            if (whereClause.comments.some) {
              const relatedRecords = await this.client.comment.findMany({
                where: { ...whereClause.comments.some, userId: record.id },
                tx,
              });
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.comments.none) {
              const violatingRecord = await this.client.comment.findFirst({
                where: { ...whereClause.comments.none, userId: record.id },
                tx,
              });
              if (violatingRecord !== null) return null;
            }
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
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
      for (const untypedKey of ["id", "name", "profile", "posts", "comments"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.UserDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async _applyRelations<Q extends Prisma.Args<Prisma.UserDelegate, "findMany">>(
    records: Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.TransactionType,
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
      const attach_comments = query.select?.comments || query.include?.comments;
      if (attach_comments) {
        unsafeRecord["comments"] = await this.client.comment.findMany(
          {
            ...(attach_comments === true ? {} : attach_comments),
            where: { userId: record.id },
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
      if (typeof query.select?.profile === "object") {
        this.client.profile
          ._getNeededStoresForFind(query.select.profile)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.profile === "object") {
        this.client.profile
          ._getNeededStoresForFind(query.include.profile)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.posts || query?.include?.posts) {
      neededStores.add("Post");
      if (typeof query.select?.posts === "object") {
        this.client.post
          ._getNeededStoresForFind(query.select.posts)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.posts === "object") {
        this.client.post
          ._getNeededStoresForFind(query.include.posts)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.comments || query?.include?.comments) {
      neededStores.add("Comment");
      if (typeof query.select?.comments === "object") {
        this.client.comment
          ._getNeededStoresForFind(query.select.comments)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.comments === "object") {
        this.client.comment
          ._getNeededStoresForFind(query.include.comments)
          .forEach((storeName) => neededStores.add(storeName));
      }
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
        const createData = Array.isArray(data.profile.create) ? data.profile.create : [data.profile.create];
        createData.forEach((record) =>
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
        const createData = Array.isArray(data.posts.create) ? data.posts.create : [data.posts.create];
        createData.forEach((record) =>
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
    if (data.comments) {
      neededStores.add("Comment");
      if (data.comments.create) {
        const createData = Array.isArray(data.comments.create) ? data.comments.create : [data.comments.create];
        createData.forEach((record) =>
          this.client.comment._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.comments.connectOrCreate) {
        IDBUtils.convertToArray(data.comments.connectOrCreate).forEach((record) =>
          this.client.comment
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.comments.createMany) {
        IDBUtils.convertToArray(data.comments.createMany.data).forEach((record) =>
          this.client.comment._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
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
    delete recordWithoutNestedCreate.comments;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">;
  }

  async findMany<Q extends Prisma.Args<Prisma.UserDelegate, "findMany">>(
    query?: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findMany">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("User").getAll(), query?.where, tx);
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
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findFirst">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query))[0] ?? null;
  }

  async findFirstOrThrow<Q extends Prisma.Args<Prisma.UserDelegate, "findFirstOrThrow">>(
    query?: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, tx);
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }

  async findUnique<Q extends Prisma.Args<Prisma.UserDelegate, "findUnique">>(
    query: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findUnique">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id) {
      record = await tx.objectStore("User").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    return recordWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "findUnique">;
  }

  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.UserDelegate, "findUniqueOrThrow">>(
    query: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findUniqueOrThrow">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, tx);
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
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
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("User").add(record);
    if (query.data.profile?.create) {
      await this.client.profile.create(
        {
          data: { ...query.data.profile.create, userId: keyPath[0] },
        },
        tx,
      );
    }
    if (query.data.profile?.connect) {
      await this.client.profile.update({ where: query.data.profile.connect, data: { userId: keyPath[0] } }, tx);
    }
    if (query.data.profile?.connectOrCreate) {
      throw new Error("connectOrCreate not yet implemented");
    }
    if (query.data.posts?.create) {
      for (const createData of IDBUtils.convertToArray(query.data.posts.create)) {
        await this.client.post.create({ data: { ...createData, author: { connect: { id: keyPath[0] } } } }, tx);
      }
    }
    if (query.data.posts?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.posts.connect).map(async (connectWhere) => {
          await this.client.post.update({ where: connectWhere, data: { authorId: keyPath[0] } }, tx);
        }),
      );
    }
    if (query.data.posts?.connectOrCreate) {
      throw new Error("connectOrCreate not yet implemented");
    }
    if (query.data.posts?.createMany) {
      await this.client.post.createMany(
        {
          data: IDBUtils.convertToArray(query.data.posts.createMany.data).map((createData) => ({
            ...createData,
            authorId: keyPath[0],
          })),
        },
        tx,
      );
    }
    if (query.data.comments?.create) {
      const createData = Array.isArray(query.data.comments.create)
        ? query.data.comments.create
        : [query.data.comments.create];
      await Promise.all(
        createData.map(async (elem) => {
          if ("post" in elem && !("postId" in elem)) {
            await this.client.comment.create({ data: { ...elem, user: { connect: { id: keyPath[0] } } } }, tx);
          } else if (elem.postId !== undefined) {
            await this.client.comment.create({ data: { ...elem, userId: keyPath[0] } }, tx);
          }
        }),
      );
    }
    if (query.data.comments?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.comments.connect).map(async (connectWhere) => {
          await this.client.comment.update({ where: connectWhere, data: { userId: keyPath[0] } }, tx);
        }),
      );
    }
    if (query.data.comments?.connectOrCreate) {
      throw new Error("connectOrCreate not yet implemented");
    }
    if (query.data.comments?.createMany) {
      await this.client.comment.createMany(
        {
          data: IDBUtils.convertToArray(query.data.comments.createMany.data).map((createData) => ({
            ...createData,
            userId: keyPath[0],
          })),
        },
        tx,
      );
    }
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
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "update">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, tx);
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const stringFields = ["name"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const intFields = ["id"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    const keyPath = await tx.objectStore("User").put(record);
    const recordWithRelations = (await this.findUnique(
      {
        ...query,
        where: { id: keyPath[0] },
      },
      tx,
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "update">;
  }
}

class ProfileIDBClass extends BaseIDBModelClass {
  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.ProfileDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.ProfileDelegate, R, W>(
      records,
      whereClause,
      tx,
      this.keyPath,
      this._applyWhereClause.bind(this),
    );
    return (
      await Promise.all(
        records.map(async (record) => {
          const stringFields = ["bio"] as const;
          for (const field of stringFields) {
            if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;
          }
          const numberFields = ["id", "userId"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          if (whereClause.user) {
            const { is, isNot, ...rest } = whereClause.user;
            if (is !== null && is !== undefined) {
              const relatedRecord = await this.client.user.findFirst({ where: { ...is, id: record.userId } }, tx);
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.user.findFirst({ where: { ...isNot, id: record.userId } }, tx);
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...whereClause.user, id: record.userId } },
                tx,
              );
              if (!relatedRecord) return null;
            }
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
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
    tx: IDBUtils.TransactionType,
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
      if (typeof query.select?.user === "object") {
        this.client.user._getNeededStoresForFind(query.select.user).forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.user === "object") {
        this.client.user
          ._getNeededStoresForFind(query.include.user)
          .forEach((storeName) => neededStores.add(storeName));
      }
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
        const createData = Array.isArray(data.user.create) ? data.user.create : [data.user.create];
        createData.forEach((record) =>
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

  async findMany<Q extends Prisma.Args<Prisma.ProfileDelegate, "findMany">>(
    query?: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findMany">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("Profile").getAll(), query?.where, tx);
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
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findFirst">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query))[0] ?? null;
  }

  async findFirstOrThrow<Q extends Prisma.Args<Prisma.ProfileDelegate, "findFirstOrThrow">>(
    query?: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findFirstOrThrow">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, tx);
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }

  async findUnique<Q extends Prisma.Args<Prisma.ProfileDelegate, "findUnique">>(
    query: Q,
    tx?: IDBUtils.TransactionType,
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
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    return recordWithRelations as Prisma.Result<Prisma.ProfileDelegate, Q, "findUnique">;
  }

  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.ProfileDelegate, "findUniqueOrThrow">>(
    query: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findUniqueOrThrow">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, tx);
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
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
    if (query.data.user) {
      let fk;
      if (query.data.user?.create) {
        fk = (await this.client.user.create({ data: query.data.user.create }, tx)).id;
      }
      if (query.data.user?.connect) {
        const record = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, tx);
        delete query.data.user.connect;
        fk = record.id;
      }
      if (query.data.user?.connectOrCreate) {
        throw new Error("connectOrCreate not yet implemented");
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.userId = fk as NonNullable<typeof fk>;
      delete unsafeData.user;
    } else if (query.data.userId !== undefined && query.data.userId !== null) {
      await this.client.user.findUniqueOrThrow(
        {
          where: { id: query.data.userId },
        },
        tx,
      );
    }
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("Profile").add(record);
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
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "update">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, tx);
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const stringFields = ["bio"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const intFields = ["id", "userId"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    const keyPath = await tx.objectStore("Profile").put(record);
    const recordWithRelations = (await this.findUnique(
      {
        ...query,
        where: { id: keyPath[0] },
      },
      tx,
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.ProfileDelegate, Q, "update">;
  }
}

class PostIDBClass extends BaseIDBModelClass {
  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.PostDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.PostDelegate, R, W>(
      records,
      whereClause,
      tx,
      this.keyPath,
      this._applyWhereClause.bind(this),
    );
    return (
      await Promise.all(
        records.map(async (record) => {
          const stringFields = ["title"] as const;
          for (const field of stringFields) {
            if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;
          }
          const numberFields = ["id", "authorId"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          if (whereClause.author === null) {
            if (record.authorId !== null) return null;
          }
          if (whereClause.author) {
            const { is, isNot, ...rest } = whereClause.author;
            if (is === null) {
              if (record.authorId !== null) return null;
            }
            if (is !== null && is !== undefined) {
              if (record.authorId === null) return null;
              const relatedRecord = await this.client.user.findFirst({ where: { ...is, id: record.authorId } }, tx);
              if (!relatedRecord) return null;
            }
            if (isNot === null) {
              if (record.authorId === null) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              if (record.authorId === null) return null;
              const relatedRecord = await this.client.user.findFirst({ where: { ...isNot, id: record.authorId } }, tx);
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              if (record.authorId === null) return null;
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...whereClause.author, id: record.authorId } },
                tx,
              );
              if (!relatedRecord) return null;
            }
          }
          if (whereClause.comments) {
            if (whereClause.comments.every) {
              const violatingRecord = await this.client.comment.findFirst({
                where: { NOT: { ...whereClause.comments.every }, postId: record.id },
                tx,
              });
              if (violatingRecord !== null) return null;
            }
            if (whereClause.comments.some) {
              const relatedRecords = await this.client.comment.findMany({
                where: { ...whereClause.comments.some, postId: record.id },
                tx,
              });
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.comments.none) {
              const violatingRecord = await this.client.comment.findFirst({
                where: { ...whereClause.comments.none, postId: record.id },
                tx,
              });
              if (violatingRecord !== null) return null;
            }
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
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
      for (const untypedKey of ["id", "title", "author", "authorId", "comments", "tags", "numberArr"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.PostDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async _applyRelations<Q extends Prisma.Args<Prisma.PostDelegate, "findMany">>(
    records: Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.TransactionType,
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
      const attach_comments = query.select?.comments || query.include?.comments;
      if (attach_comments) {
        unsafeRecord["comments"] = await this.client.comment.findMany(
          {
            ...(attach_comments === true ? {} : attach_comments),
            where: { postId: record.id },
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
    if (!Array.isArray(data.tags)) {
      data.tags = data.tags?.set ?? [];
    }
    if (!Array.isArray(data.numberArr)) {
      data.numberArr = data.numberArr?.set ?? [];
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
      if (typeof query.select?.author === "object") {
        this.client.user
          ._getNeededStoresForFind(query.select.author)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.author === "object") {
        this.client.user
          ._getNeededStoresForFind(query.include.author)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.comments || query?.include?.comments) {
      neededStores.add("Comment");
      if (typeof query.select?.comments === "object") {
        this.client.comment
          ._getNeededStoresForFind(query.select.comments)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.comments === "object") {
        this.client.comment
          ._getNeededStoresForFind(query.include.comments)
          .forEach((storeName) => neededStores.add(storeName));
      }
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
        const createData = Array.isArray(data.author.create) ? data.author.create : [data.author.create];
        createData.forEach((record) =>
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
    if (data.comments) {
      neededStores.add("Comment");
      if (data.comments.create) {
        const createData = Array.isArray(data.comments.create) ? data.comments.create : [data.comments.create];
        createData.forEach((record) =>
          this.client.comment._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.comments.connectOrCreate) {
        IDBUtils.convertToArray(data.comments.connectOrCreate).forEach((record) =>
          this.client.comment
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.comments.createMany) {
        IDBUtils.convertToArray(data.comments.createMany.data).forEach((record) =>
          this.client.comment._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    return neededStores;
  }

  private _removeNestedCreateData<D extends Prisma.Args<Prisma.PostDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate.author;
    delete recordWithoutNestedCreate.comments;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow">;
  }

  async findMany<Q extends Prisma.Args<Prisma.PostDelegate, "findMany">>(
    query?: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findMany">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("Post").getAll(), query?.where, tx);
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
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findFirst">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query))[0] ?? null;
  }

  async findFirstOrThrow<Q extends Prisma.Args<Prisma.PostDelegate, "findFirstOrThrow">>(
    query?: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findFirstOrThrow">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, tx);
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }

  async findUnique<Q extends Prisma.Args<Prisma.PostDelegate, "findUnique">>(
    query: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findUnique">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id) {
      record = await tx.objectStore("Post").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    return recordWithRelations as Prisma.Result<Prisma.PostDelegate, Q, "findUnique">;
  }

  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.PostDelegate, "findUniqueOrThrow">>(
    query: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findUniqueOrThrow">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, tx);
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
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
    if (query.data.author) {
      let fk;
      if (query.data.author?.create) {
        fk = (await this.client.user.create({ data: query.data.author.create }, tx)).id;
      }
      if (query.data.author?.connect) {
        const record = await this.client.user.findUniqueOrThrow({ where: query.data.author.connect }, tx);
        delete query.data.author.connect;
        fk = record.id;
      }
      if (query.data.author?.connectOrCreate) {
        throw new Error("connectOrCreate not yet implemented");
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.authorId = fk as NonNullable<typeof fk>;
      delete unsafeData.author;
    } else if (query.data.authorId !== undefined && query.data.authorId !== null) {
      await this.client.user.findUniqueOrThrow(
        {
          where: { id: query.data.authorId },
        },
        tx,
      );
    }
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("Post").add(record);
    if (query.data.comments?.create) {
      const createData = Array.isArray(query.data.comments.create)
        ? query.data.comments.create
        : [query.data.comments.create];
      await Promise.all(
        createData.map(async (elem) => {
          if ("user" in elem && !("userId" in elem)) {
            await this.client.comment.create({ data: { ...elem, post: { connect: { id: keyPath[0] } } } }, tx);
          } else if (elem.userId !== undefined) {
            await this.client.comment.create({ data: { ...elem, postId: keyPath[0] } }, tx);
          }
        }),
      );
    }
    if (query.data.comments?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.comments.connect).map(async (connectWhere) => {
          await this.client.comment.update({ where: connectWhere, data: { postId: keyPath[0] } }, tx);
        }),
      );
    }
    if (query.data.comments?.connectOrCreate) {
      throw new Error("connectOrCreate not yet implemented");
    }
    if (query.data.comments?.createMany) {
      await this.client.comment.createMany(
        {
          data: IDBUtils.convertToArray(query.data.comments.createMany.data).map((createData) => ({
            ...createData,
            postId: keyPath[0],
          })),
        },
        tx,
      );
    }
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
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "update">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, tx);
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const stringFields = ["title"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const intFields = ["id", "authorId"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    const listFields = ["tags", "numberArr"] as const;
    for (const field of listFields) {
      IDBUtils.handleScalarListUpdateField(record, field, query.data[field]);
    }
    const keyPath = await tx.objectStore("Post").put(record);
    const recordWithRelations = (await this.findUnique(
      {
        ...query,
        where: { id: keyPath[0] },
      },
      tx,
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.PostDelegate, Q, "update">;
  }
}

class CommentIDBClass extends BaseIDBModelClass {
  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.CommentDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.CommentDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.CommentDelegate, R, W>(
      records,
      whereClause,
      tx,
      this.keyPath,
      this._applyWhereClause.bind(this),
    );
    return (
      await Promise.all(
        records.map(async (record) => {
          const stringFields = ["id", "text"] as const;
          for (const field of stringFields) {
            if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;
          }
          const numberFields = ["postId", "userId"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          if (whereClause.post) {
            const { is, isNot, ...rest } = whereClause.post;
            if (is !== null && is !== undefined) {
              const relatedRecord = await this.client.post.findFirst({ where: { ...is, id: record.postId } }, tx);
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.post.findFirst({ where: { ...isNot, id: record.postId } }, tx);
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              const relatedRecord = await this.client.post.findFirst(
                { where: { ...whereClause.post, id: record.postId } },
                tx,
              );
              if (!relatedRecord) return null;
            }
          }
          if (whereClause.user) {
            const { is, isNot, ...rest } = whereClause.user;
            if (is !== null && is !== undefined) {
              const relatedRecord = await this.client.user.findFirst({ where: { ...is, id: record.userId } }, tx);
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.user.findFirst({ where: { ...isNot, id: record.userId } }, tx);
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...whereClause.user, id: record.userId } },
                tx,
              );
              if (!relatedRecord) return null;
            }
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
  }

  private _applySelectClause<S extends Prisma.Args<Prisma.CommentDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.CommentDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.CommentDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.CommentDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of ["id", "post", "postId", "user", "userId", "text"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.CommentDelegate, { select: S }, "findFirstOrThrow">[];
  }

  private async _applyRelations<Q extends Prisma.Args<Prisma.CommentDelegate, "findMany">>(
    records: Prisma.Result<Prisma.CommentDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.TransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.CommentDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_post = query.select?.post || query.include?.post;
      if (attach_post) {
        unsafeRecord["post"] = await this.client.post.findUnique(
          {
            ...(attach_post === true ? {} : attach_post),
            where: { id: record.postId },
          },
          tx,
        );
      }
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
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.CommentDelegate, Q, "findFirstOrThrow">[];
  }

  private async _fillDefaults<D extends Prisma.Args<Prisma.CommentDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as D;
    if (data.id === undefined) {
      data.id = createId();
    }
    return data;
  }

  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.CommentDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Comment");
    if (query?.select?.post || query?.include?.post) {
      neededStores.add("Post");
      if (typeof query.select?.post === "object") {
        this.client.post._getNeededStoresForFind(query.select.post).forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.post === "object") {
        this.client.post
          ._getNeededStoresForFind(query.include.post)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.user || query?.include?.user) {
      neededStores.add("User");
      if (typeof query.select?.user === "object") {
        this.client.user._getNeededStoresForFind(query.select.user).forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.user === "object") {
        this.client.user
          ._getNeededStoresForFind(query.include.user)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    return neededStores;
  }

  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.CommentDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Comment");
    if (data.post) {
      neededStores.add("Post");
      if (data.post.create) {
        const createData = Array.isArray(data.post.create) ? data.post.create : [data.post.create];
        createData.forEach((record) =>
          this.client.post._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.post.connectOrCreate) {
        IDBUtils.convertToArray(data.post.connectOrCreate).forEach((record) =>
          this.client.post._getNeededStoresForCreate(record.create).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data.postId !== undefined) {
      neededStores.add("Post");
    }
    if (data.user) {
      neededStores.add("User");
      if (data.user.create) {
        const createData = Array.isArray(data.user.create) ? data.user.create : [data.user.create];
        createData.forEach((record) =>
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

  private _removeNestedCreateData<D extends Prisma.Args<Prisma.CommentDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.CommentDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate.post;
    delete recordWithoutNestedCreate.user;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.CommentDelegate, object, "findFirstOrThrow">;
  }

  async findMany<Q extends Prisma.Args<Prisma.CommentDelegate, "findMany">>(
    query?: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "findMany">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("Comment").getAll(), query?.where, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.CommentDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    return selectAppliedRecords as Prisma.Result<Prisma.CommentDelegate, Q, "findMany">;
  }

  async findFirst<Q extends Prisma.Args<Prisma.CommentDelegate, "findFirst">>(
    query?: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "findFirst">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query))[0] ?? null;
  }

  async findFirstOrThrow<Q extends Prisma.Args<Prisma.CommentDelegate, "findFirstOrThrow">>(
    query?: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "findFirstOrThrow">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, tx);
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }

  async findUnique<Q extends Prisma.Args<Prisma.CommentDelegate, "findUnique">>(
    query: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "findUnique">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id) {
      record = await tx.objectStore("Comment").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    return recordWithRelations as Prisma.Result<Prisma.CommentDelegate, Q, "findUnique">;
  }

  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.CommentDelegate, "findUniqueOrThrow">>(
    query: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "findUniqueOrThrow">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, tx);
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }

  async count<Q extends Prisma.Args<Prisma.CommentDelegate, "count">>(
    query?: Q,
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "count">> {
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where });
      return records.length as Prisma.Result<Prisma.CommentDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.CommentCountAggregateInputType, number>> = {};
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

  async create<Q extends Prisma.Args<Prisma.CommentDelegate, "create">>(
    query: Q,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "create">> {
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    if (query.data.post) {
      let fk;
      if (query.data.post?.create) {
        fk = (await this.client.post.create({ data: query.data.post.create }, tx)).id;
      }
      if (query.data.post?.connect) {
        const record = await this.client.post.findUniqueOrThrow({ where: query.data.post.connect }, tx);
        delete query.data.post.connect;
        fk = record.id;
      }
      if (query.data.post?.connectOrCreate) {
        throw new Error("connectOrCreate not yet implemented");
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.postId = fk as NonNullable<typeof fk>;
      delete unsafeData.post;
    } else if (query.data.postId !== undefined && query.data.postId !== null) {
      await this.client.post.findUniqueOrThrow(
        {
          where: { id: query.data.postId },
        },
        tx,
      );
    }
    if (query.data.user) {
      let fk;
      if (query.data.user?.create) {
        fk = (await this.client.user.create({ data: query.data.user.create }, tx)).id;
      }
      if (query.data.user?.connect) {
        const record = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, tx);
        delete query.data.user.connect;
        fk = record.id;
      }
      if (query.data.user?.connectOrCreate) {
        throw new Error("connectOrCreate not yet implemented");
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.userId = fk as NonNullable<typeof fk>;
      delete unsafeData.user;
    } else if (query.data.userId !== undefined && query.data.userId !== null) {
      await this.client.user.findUniqueOrThrow(
        {
          where: { id: query.data.userId },
        },
        tx,
      );
    }
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("Comment").add(record);
    const data = (await tx.objectStore("Comment").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations([data], tx, query),
      query.select,
    )[0];
    return recordsWithRelations as Prisma.Result<Prisma.CommentDelegate, Q, "create">;
  }

  async createMany<Q extends Prisma.Args<Prisma.CommentDelegate, "createMany">>(
    query: Q,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "createMany">> {
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["Comment"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      await tx.objectStore("Comment").add(record);
    }
    return { count: createManyData.length };
  }

  async createManyAndReturn<Q extends Prisma.Args<Prisma.CommentDelegate, "createManyAndReturn">>(
    query: Q,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "createManyAndReturn">> {
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: unknown[] = [];
    tx = tx ?? this.client._db.transaction(["Comment"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      await tx.objectStore("Comment").add(record);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    return records as Prisma.Result<Prisma.CommentDelegate, Q, "createManyAndReturn">;
  }

  async update<Q extends Prisma.Args<Prisma.CommentDelegate, "update">>(
    query: Q,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "update">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, tx);
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const stringFields = ["id", "text"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const intFields = ["postId", "userId"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    const keyPath = await tx.objectStore("Comment").put(record);
    const recordWithRelations = (await this.findUnique(
      {
        ...query,
        where: { id: keyPath[0] },
      },
      tx,
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.CommentDelegate, Q, "update">;
  }
}

class AllFieldScalarTypesIDBClass extends BaseIDBModelClass {
  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.AllFieldScalarTypesDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.AllFieldScalarTypesDelegate, R, W>(
      records,
      whereClause,
      tx,
      this.keyPath,
      this._applyWhereClause.bind(this),
    );
    return (
      await Promise.all(
        records.map(async (record) => {
          const stringFields = ["string"] as const;
          for (const field of stringFields) {
            if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;
          }
          const numberFields = ["id", "int", "float"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          const bigIntFields = ["bigInt"] as const;
          for (const field of bigIntFields) {
            if (!IDBUtils.whereBigIntFilter(record, field, whereClause[field])) return null;
          }
          const booleanFields = ["boolean"] as const;
          for (const field of booleanFields) {
            if (!IDBUtils.whereBoolFilter(record, field, whereClause[field])) return null;
          }
          const bytesFields = ["bytes"] as const;
          for (const field of bytesFields) {
            if (!IDBUtils.whereBytesFilter(record, field, whereClause[field])) return null;
          }
          const dateTimeFields = ["dateTime"] as const;
          for (const field of dateTimeFields) {
            if (!IDBUtils.whereDateTimeFilter(record, field, whereClause[field])) return null;
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
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
        "bigIntegers",
        "float",
        "decimal",
        "dateTime",
        "dateTimes",
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
    tx: IDBUtils.TransactionType,
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
    if (Array.isArray(data.bigIntegers)) {
      data.bigIntegers = data.bigIntegers.map((n) => BigInt(n));
    } else if (typeof data.bigIntegers === "object") {
      data.bigIntegers = data.bigIntegers.set.map((n) => BigInt(n));
    } else {
      data.bigIntegers = [];
    }
    if (typeof data.dateTime === "string") {
      data.dateTime = new Date(data.dateTime);
    }
    if (Array.isArray(data.dateTimes)) {
      data.dateTimes = data.dateTimes.map((d) => new Date(d));
    } else if (typeof data.dateTimes === "object") {
      data.dateTimes = data.dateTimes.set.map((d) => new Date(d));
    } else {
      data.dateTimes = [];
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

  async findMany<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findMany">>(
    query?: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findMany">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(
      await tx.objectStore("AllFieldScalarTypes").getAll(),
      query?.where,
      tx,
    );
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
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findFirst">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query))[0] ?? null;
  }

  async findFirstOrThrow<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findFirstOrThrow">>(
    query?: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findFirstOrThrow">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, tx);
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }

  async findUnique<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findUnique">>(
    query: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findUnique">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id) {
      record = await tx.objectStore("AllFieldScalarTypes").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    return recordWithRelations as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findUnique">;
  }

  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findUniqueOrThrow">>(
    query: Q,
    tx?: IDBUtils.TransactionType,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findUniqueOrThrow">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, tx);
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
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
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("AllFieldScalarTypes").add(record);
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
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "update">> {
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, tx);
    if (record === null) {
      tx.abort();
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
    const intFields = ["id", "int"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    const listFields = ["bigIntegers", "dateTimes"] as const;
    for (const field of listFields) {
      IDBUtils.handleScalarListUpdateField(record, field, query.data[field]);
    }
    const keyPath = await tx.objectStore("AllFieldScalarTypes").put(record);
    const recordWithRelations = (await this.findUnique(
      {
        ...query,
        where: { id: keyPath[0] },
      },
      tx,
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "update">;
  }
}
