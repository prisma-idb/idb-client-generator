/* eslint-disable @typescript-eslint/no-unused-vars */
import { openDB } from "idb";
import type { IDBPDatabase, StoreNames, IDBPTransaction } from "idb";
import type { Prisma } from "../../generated/prisma/client";
import * as IDBUtils from "./idb-utils";
import type { PrismaIDBSchema } from "./idb-interface";
import { createId } from "@paralleldrive/cuid2";
import { v4 as uuidv4 } from "uuid";
const IDB_VERSION = 1;
export class PrismaIDBClient {
  private static instance: PrismaIDBClient;
  _db!: IDBPDatabase<PrismaIDBSchema>;
  private outboxEnabled: boolean = false;
  private includedModels: Set<string>;

  private constructor() {
    this.includedModels = new Set([
      "User",
      "Group",
      "UserGroup",
      "Profile",
      "Post",
      "Comment",
      "AllFieldScalarTypes",
      "Father",
      "Mother",
      "Child",
      "ModelWithEnum",
      "TestUuid",
      "ModelWithOptionalRelationToUniqueAttributes",
      "ModelWithUniqueAttributes",
      "Todo",
    ]);
  }
  user!: UserIDBClass;
  group!: GroupIDBClass;
  userGroup!: UserGroupIDBClass;
  profile!: ProfileIDBClass;
  post!: PostIDBClass;
  comment!: CommentIDBClass;
  allFieldScalarTypes!: AllFieldScalarTypesIDBClass;
  father!: FatherIDBClass;
  mother!: MotherIDBClass;
  child!: ChildIDBClass;
  modelWithEnum!: ModelWithEnumIDBClass;
  testUuid!: TestUuidIDBClass;
  modelWithOptionalRelationToUniqueAttributes!: ModelWithOptionalRelationToUniqueAttributesIDBClass;
  modelWithUniqueAttributes!: ModelWithUniqueAttributesIDBClass;
  todo!: TodoIDBClass;
  public static async createClient(): Promise<PrismaIDBClient> {
    if (!PrismaIDBClient.instance) {
      const client = new PrismaIDBClient();
      await client.initialize();
      PrismaIDBClient.instance = client;
    }
    return PrismaIDBClient.instance;
  }
  public async resetDatabase() {
    this._db.close();
    window.indexedDB.deleteDatabase("prisma-idb");
    await PrismaIDBClient.instance.initialize();
  }
  shouldTrackModel(modelName: string): boolean {
    return this.outboxEnabled && this.includedModels.has(modelName);
  }
  private async initialize() {
    this._db = await openDB<PrismaIDBSchema>("prisma-idb", IDB_VERSION, {
      upgrade(db) {
        db.createObjectStore("User", { keyPath: ["id"] });
        db.createObjectStore("Group", { keyPath: ["id"] });
        db.createObjectStore("UserGroup", { keyPath: ["groupId", "userId"] });
        const ProfileStore = db.createObjectStore("Profile", { keyPath: ["id"] });
        ProfileStore.createIndex("userIdIndex", ["userId"], { unique: true });
        db.createObjectStore("Post", { keyPath: ["id"] });
        db.createObjectStore("Comment", { keyPath: ["id"] });
        db.createObjectStore("AllFieldScalarTypes", { keyPath: ["id"] });
        const FatherStore = db.createObjectStore("Father", { keyPath: ["firstName", "lastName"] });
        FatherStore.createIndex("motherFirstName_motherLastNameIndex", ["motherFirstName", "motherLastName"], {
          unique: true,
        });
        db.createObjectStore("Mother", { keyPath: ["firstName", "lastName"] });
        db.createObjectStore("Child", { keyPath: ["childFirstName", "childLastName"] });
        db.createObjectStore("ModelWithEnum", { keyPath: ["id"] });
        db.createObjectStore("TestUuid", { keyPath: ["id"] });
        db.createObjectStore("ModelWithOptionalRelationToUniqueAttributes", { keyPath: ["id"] });
        const ModelWithUniqueAttributesStore = db.createObjectStore("ModelWithUniqueAttributes", { keyPath: ["id"] });
        ModelWithUniqueAttributesStore.createIndex("codeIndex", ["code"], { unique: true });
        db.createObjectStore("Todo", { keyPath: ["id"] });
      },
    });
    this.user = new UserIDBClass(this, ["id"]);
    this.group = new GroupIDBClass(this, ["id"]);
    this.userGroup = new UserGroupIDBClass(this, ["groupId", "userId"]);
    this.profile = new ProfileIDBClass(this, ["id"]);
    this.post = new PostIDBClass(this, ["id"]);
    this.comment = new CommentIDBClass(this, ["id"]);
    this.allFieldScalarTypes = new AllFieldScalarTypesIDBClass(this, ["id"]);
    this.father = new FatherIDBClass(this, ["firstName", "lastName"]);
    this.mother = new MotherIDBClass(this, ["firstName", "lastName"]);
    this.child = new ChildIDBClass(this, ["childFirstName", "childLastName"]);
    this.modelWithEnum = new ModelWithEnumIDBClass(this, ["id"]);
    this.testUuid = new TestUuidIDBClass(this, ["id"]);
    this.modelWithOptionalRelationToUniqueAttributes = new ModelWithOptionalRelationToUniqueAttributesIDBClass(this, [
      "id",
    ]);
    this.modelWithUniqueAttributes = new ModelWithUniqueAttributesIDBClass(this, ["id"]);
    this.todo = new TodoIDBClass(this, ["id"]);
  }
}
class BaseIDBModelClass<T extends keyof PrismaIDBSchema> {
  protected client: PrismaIDBClient;
  protected keyPath: string[];
  protected modelName: string;
  private eventEmitter: EventTarget;

  constructor(client: PrismaIDBClient, keyPath: string[], modelName: string) {
    this.client = client;
    this.keyPath = keyPath;
    this.modelName = modelName;
    this.eventEmitter = new EventTarget();
  }
  subscribe(
    event: "create" | "update" | "delete" | ("create" | "update" | "delete")[],
    callback: (
      e: CustomEventInit<{ keyPath: PrismaIDBSchema[T]["key"]; oldKeyPath?: PrismaIDBSchema[T]["key"] }>,
    ) => void,
  ) {
    if (Array.isArray(event)) {
      event.forEach((event) => this.eventEmitter.addEventListener(event, callback));
    } else {
      this.eventEmitter.addEventListener(event, callback);
    }
  }
  unsubscribe(
    event: "create" | "update" | "delete" | ("create" | "update" | "delete")[],
    callback: (
      e: CustomEventInit<{ keyPath: PrismaIDBSchema[T]["key"]; oldKeyPath?: PrismaIDBSchema[T]["key"] }>,
    ) => void,
  ) {
    if (Array.isArray(event)) {
      event.forEach((event) => this.eventEmitter.removeEventListener(event, callback));
      return;
    }
    this.eventEmitter.removeEventListener(event, callback);
  }
  protected async emit(
    event: "create" | "update" | "delete",
    keyPath: PrismaIDBSchema[T]["key"],
    oldKeyPath?: PrismaIDBSchema[T]["key"],
    record?: unknown,
    silent?: boolean,
    addToOutbox?: boolean,
  ) {
    const shouldEmit = !silent;

    if (shouldEmit) {
      if (event === "update") {
        this.eventEmitter.dispatchEvent(new CustomEvent(event, { detail: { keyPath, oldKeyPath } }));
      } else {
        this.eventEmitter.dispatchEvent(new CustomEvent(event, { detail: { keyPath } }));
      }
    }
  }
}
class UserIDBClass extends BaseIDBModelClass<"User"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "User");
  }

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
            const relatedRecord = await this.client.profile.findFirst(
              {
                where: { userId: record.id },
              },
              { tx },
            );
            if (relatedRecord) return null;
          }
          if (whereClause.profile) {
            const { is, isNot, ...rest } = whereClause.profile;
            if (is === null) {
              const relatedRecord = await this.client.profile.findFirst({ where: { userId: record.id } }, { tx });
              if (relatedRecord) return null;
            }
            if (is !== null && is !== undefined) {
              const relatedRecord = await this.client.profile.findFirst(
                { where: { ...is, userId: record.id } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
            if (isNot === null) {
              const relatedRecord = await this.client.profile.findFirst({ where: { userId: record.id } }, { tx });
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.profile.findFirst(
                { where: { ...isNot, userId: record.id } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              if (record.id === null) return null;
              const relatedRecord = await this.client.profile.findFirst(
                { where: { ...whereClause.profile, userId: record.id } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
          }
          if (whereClause.posts) {
            if (whereClause.posts.every) {
              const violatingRecord = await this.client.post.findFirst(
                {
                  where: { NOT: { ...whereClause.posts.every }, authorId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
            if (whereClause.posts.some) {
              const relatedRecords = await this.client.post.findMany(
                {
                  where: { ...whereClause.posts.some, authorId: record.id },
                },
                { tx },
              );
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.posts.none) {
              const violatingRecord = await this.client.post.findFirst(
                {
                  where: { ...whereClause.posts.none, authorId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
          }
          if (whereClause.comments) {
            if (whereClause.comments.every) {
              const violatingRecord = await this.client.comment.findFirst(
                {
                  where: { NOT: { ...whereClause.comments.every }, userId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
            if (whereClause.comments.some) {
              const relatedRecords = await this.client.comment.findMany(
                {
                  where: { ...whereClause.comments.some, userId: record.id },
                },
                { tx },
              );
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.comments.none) {
              const violatingRecord = await this.client.comment.findFirst(
                {
                  where: { ...whereClause.comments.none, userId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
          }
          if (whereClause.Child) {
            if (whereClause.Child.every) {
              const violatingRecord = await this.client.child.findFirst(
                {
                  where: { NOT: { ...whereClause.Child.every }, userId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
            if (whereClause.Child.some) {
              const relatedRecords = await this.client.child.findMany(
                {
                  where: { ...whereClause.Child.some, userId: record.id },
                },
                { tx },
              );
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.Child.none) {
              const violatingRecord = await this.client.child.findFirst(
                {
                  where: { ...whereClause.Child.none, userId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
          }
          if (whereClause.Father) {
            if (whereClause.Father.every) {
              const violatingRecord = await this.client.father.findFirst(
                {
                  where: { NOT: { ...whereClause.Father.every }, userId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
            if (whereClause.Father.some) {
              const relatedRecords = await this.client.father.findMany(
                {
                  where: { ...whereClause.Father.some, userId: record.id },
                },
                { tx },
              );
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.Father.none) {
              const violatingRecord = await this.client.father.findFirst(
                {
                  where: { ...whereClause.Father.none, userId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
          }
          if (whereClause.Mother) {
            if (whereClause.Mother.every) {
              const violatingRecord = await this.client.mother.findFirst(
                {
                  where: { NOT: { ...whereClause.Mother.every }, userId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
            if (whereClause.Mother.some) {
              const relatedRecords = await this.client.mother.findMany(
                {
                  where: { ...whereClause.Mother.some, userId: record.id },
                },
                { tx },
              );
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.Mother.none) {
              const violatingRecord = await this.client.mother.findFirst(
                {
                  where: { ...whereClause.Mother.none, userId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
          }
          if (whereClause.groups) {
            if (whereClause.groups.every) {
              const violatingRecord = await this.client.userGroup.findFirst(
                {
                  where: { NOT: { ...whereClause.groups.every }, userId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
            if (whereClause.groups.some) {
              const relatedRecords = await this.client.userGroup.findMany(
                {
                  where: { ...whereClause.groups.some, userId: record.id },
                },
                { tx },
              );
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.groups.none) {
              const violatingRecord = await this.client.userGroup.findFirst(
                {
                  where: { ...whereClause.groups.none, userId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
          }
          if (whereClause.todos) {
            if (whereClause.todos.every) {
              const violatingRecord = await this.client.todo.findFirst(
                {
                  where: { NOT: { ...whereClause.todos.every }, userId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
            if (whereClause.todos.some) {
              const relatedRecords = await this.client.todo.findMany(
                {
                  where: { ...whereClause.todos.some, userId: record.id },
                },
                { tx },
              );
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.todos.none) {
              const violatingRecord = await this.client.todo.findFirst(
                {
                  where: { ...whereClause.todos.none, userId: record.id },
                },
                { tx },
              );
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
      for (const untypedKey of [
        "id",
        "name",
        "profile",
        "posts",
        "comments",
        "Child",
        "Father",
        "Mother",
        "groups",
        "todos",
      ]) {
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
          { tx },
        );
      }
      const attach_posts = query.select?.posts || query.include?.posts;
      if (attach_posts) {
        unsafeRecord["posts"] = await this.client.post.findMany(
          {
            ...(attach_posts === true ? {} : attach_posts),
            where: { authorId: record.id! },
          },
          { tx },
        );
      }
      const attach_comments = query.select?.comments || query.include?.comments;
      if (attach_comments) {
        unsafeRecord["comments"] = await this.client.comment.findMany(
          {
            ...(attach_comments === true ? {} : attach_comments),
            where: { userId: record.id! },
          },
          { tx },
        );
      }
      const attach_Child = query.select?.Child || query.include?.Child;
      if (attach_Child) {
        unsafeRecord["Child"] = await this.client.child.findMany(
          {
            ...(attach_Child === true ? {} : attach_Child),
            where: { userId: record.id! },
          },
          { tx },
        );
      }
      const attach_Father = query.select?.Father || query.include?.Father;
      if (attach_Father) {
        unsafeRecord["Father"] = await this.client.father.findMany(
          {
            ...(attach_Father === true ? {} : attach_Father),
            where: { userId: record.id! },
          },
          { tx },
        );
      }
      const attach_Mother = query.select?.Mother || query.include?.Mother;
      if (attach_Mother) {
        unsafeRecord["Mother"] = await this.client.mother.findMany(
          {
            ...(attach_Mother === true ? {} : attach_Mother),
            where: { userId: record.id! },
          },
          { tx },
        );
      }
      const attach_groups = query.select?.groups || query.include?.groups;
      if (attach_groups) {
        unsafeRecord["groups"] = await this.client.userGroup.findMany(
          {
            ...(attach_groups === true ? {} : attach_groups),
            where: { userId: record.id! },
          },
          { tx },
        );
      }
      const attach_todos = query.select?.todos || query.include?.todos;
      if (attach_todos) {
        unsafeRecord["todos"] = await this.client.todo.findMany(
          {
            ...(attach_todos === true ? {} : attach_todos),
            where: { userId: record.id! },
          },
          { tx },
        );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">[];
  }
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.UserDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.UserOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = ["id", "name"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
    if (orderByInput.profile) {
      return record.id === null
        ? null
        : await this.client.profile._resolveOrderByKey(
            await this.client.profile.findFirstOrThrow({ where: { userId: record.id } }),
            orderByInput.profile,
            tx,
          );
    }
    if (orderByInput.posts) {
      return await this.client.post.count({ where: { authorId: record.id } }, { tx });
    }
    if (orderByInput.comments) {
      return await this.client.comment.count({ where: { userId: record.id } }, { tx });
    }
    if (orderByInput.Child) {
      return await this.client.child.count({ where: { userId: record.id } }, { tx });
    }
    if (orderByInput.Father) {
      return await this.client.father.count({ where: { userId: record.id } }, { tx });
    }
    if (orderByInput.Mother) {
      return await this.client.mother.count({ where: { userId: record.id } }, { tx });
    }
    if (orderByInput.groups) {
      return await this.client.userGroup.count({ where: { userId: record.id } }, { tx });
    }
    if (orderByInput.todos) {
      return await this.client.todo.count({ where: { userId: record.id } }, { tx });
    }
  }
  _resolveSortOrder(
    orderByInput: Prisma.UserOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = ["id", "name"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    if (orderByInput.profile) {
      return this.client.profile._resolveSortOrder(orderByInput.profile);
    }
    if (orderByInput.posts?._count) {
      return orderByInput.posts._count;
    }
    if (orderByInput.comments?._count) {
      return orderByInput.comments._count;
    }
    if (orderByInput.Child?._count) {
      return orderByInput.Child._count;
    }
    if (orderByInput.Father?._count) {
      return orderByInput.Father._count;
    }
    if (orderByInput.Mother?._count) {
      return orderByInput.Mother._count;
    }
    if (orderByInput.groups?._count) {
      return orderByInput.groups._count;
    }
    if (orderByInput.todos?._count) {
      return orderByInput.todos._count;
    }
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.UserDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.id === undefined) {
      const transaction = tx ?? this.client._db.transaction(["User"], "readwrite");
      const store = transaction.objectStore("User");
      const cursor = await store.openCursor(null, "prev");
      data.id = cursor ? Number(cursor.key) + 1 : 1;
    }
    return data;
  }
  _getNeededStoresForWhere<W extends Prisma.Args<Prisma.UserDelegate, "findMany">["where"]>(
    whereClause: W,
    neededStores: Set<StoreNames<PrismaIDBSchema>>,
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
    if (whereClause.profile) {
      neededStores.add("Profile");
      this.client.profile._getNeededStoresForWhere(whereClause.profile, neededStores);
    }
    if (whereClause.posts) {
      neededStores.add("Post");
      this.client.post._getNeededStoresForWhere(whereClause.posts.every, neededStores);
      this.client.post._getNeededStoresForWhere(whereClause.posts.some, neededStores);
      this.client.post._getNeededStoresForWhere(whereClause.posts.none, neededStores);
    }
    if (whereClause.comments) {
      neededStores.add("Comment");
      this.client.comment._getNeededStoresForWhere(whereClause.comments.every, neededStores);
      this.client.comment._getNeededStoresForWhere(whereClause.comments.some, neededStores);
      this.client.comment._getNeededStoresForWhere(whereClause.comments.none, neededStores);
    }
    if (whereClause.Child) {
      neededStores.add("Child");
      this.client.child._getNeededStoresForWhere(whereClause.Child.every, neededStores);
      this.client.child._getNeededStoresForWhere(whereClause.Child.some, neededStores);
      this.client.child._getNeededStoresForWhere(whereClause.Child.none, neededStores);
    }
    if (whereClause.Father) {
      neededStores.add("Father");
      this.client.father._getNeededStoresForWhere(whereClause.Father.every, neededStores);
      this.client.father._getNeededStoresForWhere(whereClause.Father.some, neededStores);
      this.client.father._getNeededStoresForWhere(whereClause.Father.none, neededStores);
    }
    if (whereClause.Mother) {
      neededStores.add("Mother");
      this.client.mother._getNeededStoresForWhere(whereClause.Mother.every, neededStores);
      this.client.mother._getNeededStoresForWhere(whereClause.Mother.some, neededStores);
      this.client.mother._getNeededStoresForWhere(whereClause.Mother.none, neededStores);
    }
    if (whereClause.groups) {
      neededStores.add("UserGroup");
      this.client.userGroup._getNeededStoresForWhere(whereClause.groups.every, neededStores);
      this.client.userGroup._getNeededStoresForWhere(whereClause.groups.some, neededStores);
      this.client.userGroup._getNeededStoresForWhere(whereClause.groups.none, neededStores);
    }
    if (whereClause.todos) {
      neededStores.add("Todo");
      this.client.todo._getNeededStoresForWhere(whereClause.todos.every, neededStores);
      this.client.todo._getNeededStoresForWhere(whereClause.todos.some, neededStores);
      this.client.todo._getNeededStoresForWhere(whereClause.todos.none, neededStores);
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.UserDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("User");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
      const orderBy_profile = orderBy.find((clause) => clause.profile);
      if (orderBy_profile) {
        this.client.profile
          ._getNeededStoresForFind({ orderBy: orderBy_profile.profile })
          .forEach((storeName) => neededStores.add(storeName));
      }
      const orderBy_posts = orderBy.find((clause) => clause.posts);
      if (orderBy_posts) {
        neededStores.add("Post");
      }
      const orderBy_comments = orderBy.find((clause) => clause.comments);
      if (orderBy_comments) {
        neededStores.add("Comment");
      }
      const orderBy_Child = orderBy.find((clause) => clause.Child);
      if (orderBy_Child) {
        neededStores.add("Child");
      }
      const orderBy_Father = orderBy.find((clause) => clause.Father);
      if (orderBy_Father) {
        neededStores.add("Father");
      }
      const orderBy_Mother = orderBy.find((clause) => clause.Mother);
      if (orderBy_Mother) {
        neededStores.add("Mother");
      }
      const orderBy_groups = orderBy.find((clause) => clause.groups);
      if (orderBy_groups) {
        neededStores.add("UserGroup");
      }
      const orderBy_todos = orderBy.find((clause) => clause.todos);
      if (orderBy_todos) {
        neededStores.add("Todo");
      }
    }
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
    if (query?.select?.Child || query?.include?.Child) {
      neededStores.add("Child");
      if (typeof query.select?.Child === "object") {
        this.client.child
          ._getNeededStoresForFind(query.select.Child)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.Child === "object") {
        this.client.child
          ._getNeededStoresForFind(query.include.Child)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.Father || query?.include?.Father) {
      neededStores.add("Father");
      if (typeof query.select?.Father === "object") {
        this.client.father
          ._getNeededStoresForFind(query.select.Father)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.Father === "object") {
        this.client.father
          ._getNeededStoresForFind(query.include.Father)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.Mother || query?.include?.Mother) {
      neededStores.add("Mother");
      if (typeof query.select?.Mother === "object") {
        this.client.mother
          ._getNeededStoresForFind(query.select.Mother)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.Mother === "object") {
        this.client.mother
          ._getNeededStoresForFind(query.include.Mother)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.groups || query?.include?.groups) {
      neededStores.add("UserGroup");
      if (typeof query.select?.groups === "object") {
        this.client.userGroup
          ._getNeededStoresForFind(query.select.groups)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.groups === "object") {
        this.client.userGroup
          ._getNeededStoresForFind(query.include.groups)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.todos || query?.include?.todos) {
      neededStores.add("Todo");
      if (typeof query.select?.todos === "object") {
        this.client.todo
          ._getNeededStoresForFind(query.select.todos)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.todos === "object") {
        this.client.todo
          ._getNeededStoresForFind(query.include.todos)
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
    if (data?.profile) {
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
    if (data?.posts) {
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
    if (data?.comments) {
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
    if (data?.Child) {
      neededStores.add("Child");
      if (data.Child.create) {
        const createData = Array.isArray(data.Child.create) ? data.Child.create : [data.Child.create];
        createData.forEach((record) =>
          this.client.child._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.Child.connectOrCreate) {
        IDBUtils.convertToArray(data.Child.connectOrCreate).forEach((record) =>
          this.client.child
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.Child.createMany) {
        IDBUtils.convertToArray(data.Child.createMany.data).forEach((record) =>
          this.client.child._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data?.Father) {
      neededStores.add("Father");
      if (data.Father.create) {
        const createData = Array.isArray(data.Father.create) ? data.Father.create : [data.Father.create];
        createData.forEach((record) =>
          this.client.father._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.Father.connectOrCreate) {
        IDBUtils.convertToArray(data.Father.connectOrCreate).forEach((record) =>
          this.client.father
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.Father.createMany) {
        IDBUtils.convertToArray(data.Father.createMany.data).forEach((record) =>
          this.client.father._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data?.Mother) {
      neededStores.add("Mother");
      if (data.Mother.create) {
        const createData = Array.isArray(data.Mother.create) ? data.Mother.create : [data.Mother.create];
        createData.forEach((record) =>
          this.client.mother._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.Mother.connectOrCreate) {
        IDBUtils.convertToArray(data.Mother.connectOrCreate).forEach((record) =>
          this.client.mother
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.Mother.createMany) {
        IDBUtils.convertToArray(data.Mother.createMany.data).forEach((record) =>
          this.client.mother._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data?.groups) {
      neededStores.add("UserGroup");
      if (data.groups.create) {
        const createData = Array.isArray(data.groups.create) ? data.groups.create : [data.groups.create];
        createData.forEach((record) =>
          this.client.userGroup._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.groups.connectOrCreate) {
        IDBUtils.convertToArray(data.groups.connectOrCreate).forEach((record) =>
          this.client.userGroup
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.groups.createMany) {
        IDBUtils.convertToArray(data.groups.createMany.data).forEach((record) =>
          this.client.userGroup._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data?.todos) {
      neededStores.add("Todo");
      if (data.todos.create) {
        const createData = Array.isArray(data.todos.create) ? data.todos.create : [data.todos.create];
        createData.forEach((record) =>
          this.client.todo._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.todos.connectOrCreate) {
        IDBUtils.convertToArray(data.todos.connectOrCreate).forEach((record) =>
          this.client.todo._getNeededStoresForCreate(record.create).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.todos.createMany) {
        IDBUtils.convertToArray(data.todos.createMany.data).forEach((record) =>
          this.client.todo._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.UserDelegate, "update">>(
    query: Partial<Q>,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.UserDelegate, "create">["data"]),
    );
    if (query.data?.profile?.connect) {
      neededStores.add("Profile");
      IDBUtils.convertToArray(query.data.profile.connect).forEach((connect) => {
        this.client.profile._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.profile?.disconnect) {
      neededStores.add("Profile");
      if (query.data?.profile?.disconnect !== true) {
        IDBUtils.convertToArray(query.data.profile.disconnect).forEach((disconnect) => {
          this.client.profile._getNeededStoresForWhere(disconnect, neededStores);
        });
      }
    }
    if (query.data?.profile?.update) {
      neededStores.add("Profile");
      IDBUtils.convertToArray(query.data.profile.update).forEach((update) => {
        this.client.profile
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.ProfileDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.profile?.upsert) {
      neededStores.add("Profile");
      IDBUtils.convertToArray(query.data.profile.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.ProfileDelegate,
          "update"
        >;
        this.client.profile._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.posts?.connect) {
      neededStores.add("Post");
      IDBUtils.convertToArray(query.data.posts.connect).forEach((connect) => {
        this.client.post._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.posts?.set) {
      neededStores.add("Post");
      IDBUtils.convertToArray(query.data.posts.set).forEach((setWhere) => {
        this.client.post._getNeededStoresForWhere(setWhere, neededStores);
      });
    }
    if (query.data?.posts?.updateMany) {
      neededStores.add("Post");
      IDBUtils.convertToArray(query.data.posts.updateMany).forEach((update) => {
        this.client.post
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.PostDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.posts?.update) {
      neededStores.add("Post");
      IDBUtils.convertToArray(query.data.posts.update).forEach((update) => {
        this.client.post
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.PostDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.posts?.upsert) {
      neededStores.add("Post");
      IDBUtils.convertToArray(query.data.posts.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.PostDelegate,
          "update"
        >;
        this.client.post._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.comments?.connect) {
      neededStores.add("Comment");
      IDBUtils.convertToArray(query.data.comments.connect).forEach((connect) => {
        this.client.comment._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.comments?.set) {
      neededStores.add("Comment");
      IDBUtils.convertToArray(query.data.comments.set).forEach((setWhere) => {
        this.client.comment._getNeededStoresForWhere(setWhere, neededStores);
      });
    }
    if (query.data?.comments?.updateMany) {
      neededStores.add("Comment");
      IDBUtils.convertToArray(query.data.comments.updateMany).forEach((update) => {
        this.client.comment
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.CommentDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.comments?.update) {
      neededStores.add("Comment");
      IDBUtils.convertToArray(query.data.comments.update).forEach((update) => {
        this.client.comment
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.CommentDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.comments?.upsert) {
      neededStores.add("Comment");
      IDBUtils.convertToArray(query.data.comments.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.CommentDelegate,
          "update"
        >;
        this.client.comment._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.Child?.connect) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.Child.connect).forEach((connect) => {
        this.client.child._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.Child?.set) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.Child.set).forEach((setWhere) => {
        this.client.child._getNeededStoresForWhere(setWhere, neededStores);
      });
    }
    if (query.data?.Child?.updateMany) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.Child.updateMany).forEach((update) => {
        this.client.child
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.ChildDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.Child?.update) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.Child.update).forEach((update) => {
        this.client.child
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.ChildDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.Child?.upsert) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.Child.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.ChildDelegate,
          "update"
        >;
        this.client.child._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.Father?.connect) {
      neededStores.add("Father");
      IDBUtils.convertToArray(query.data.Father.connect).forEach((connect) => {
        this.client.father._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.Father?.set) {
      neededStores.add("Father");
      IDBUtils.convertToArray(query.data.Father.set).forEach((setWhere) => {
        this.client.father._getNeededStoresForWhere(setWhere, neededStores);
      });
    }
    if (query.data?.Father?.updateMany) {
      neededStores.add("Father");
      IDBUtils.convertToArray(query.data.Father.updateMany).forEach((update) => {
        this.client.father
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.FatherDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.Father?.update) {
      neededStores.add("Father");
      IDBUtils.convertToArray(query.data.Father.update).forEach((update) => {
        this.client.father
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.FatherDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.Father?.upsert) {
      neededStores.add("Father");
      IDBUtils.convertToArray(query.data.Father.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.FatherDelegate,
          "update"
        >;
        this.client.father._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.Mother?.connect) {
      neededStores.add("Mother");
      IDBUtils.convertToArray(query.data.Mother.connect).forEach((connect) => {
        this.client.mother._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.Mother?.set) {
      neededStores.add("Mother");
      IDBUtils.convertToArray(query.data.Mother.set).forEach((setWhere) => {
        this.client.mother._getNeededStoresForWhere(setWhere, neededStores);
      });
    }
    if (query.data?.Mother?.updateMany) {
      neededStores.add("Mother");
      IDBUtils.convertToArray(query.data.Mother.updateMany).forEach((update) => {
        this.client.mother
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.MotherDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.Mother?.update) {
      neededStores.add("Mother");
      IDBUtils.convertToArray(query.data.Mother.update).forEach((update) => {
        this.client.mother
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.MotherDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.Mother?.upsert) {
      neededStores.add("Mother");
      IDBUtils.convertToArray(query.data.Mother.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.MotherDelegate,
          "update"
        >;
        this.client.mother._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.groups?.connect) {
      neededStores.add("UserGroup");
      IDBUtils.convertToArray(query.data.groups.connect).forEach((connect) => {
        this.client.userGroup._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.groups?.set) {
      neededStores.add("UserGroup");
      IDBUtils.convertToArray(query.data.groups.set).forEach((setWhere) => {
        this.client.userGroup._getNeededStoresForWhere(setWhere, neededStores);
      });
    }
    if (query.data?.groups?.updateMany) {
      neededStores.add("UserGroup");
      IDBUtils.convertToArray(query.data.groups.updateMany).forEach((update) => {
        this.client.userGroup
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.UserGroupDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.groups?.update) {
      neededStores.add("UserGroup");
      IDBUtils.convertToArray(query.data.groups.update).forEach((update) => {
        this.client.userGroup
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.UserGroupDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.groups?.upsert) {
      neededStores.add("UserGroup");
      IDBUtils.convertToArray(query.data.groups.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.UserGroupDelegate,
          "update"
        >;
        this.client.userGroup._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.todos?.connect) {
      neededStores.add("Todo");
      IDBUtils.convertToArray(query.data.todos.connect).forEach((connect) => {
        this.client.todo._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.todos?.set) {
      neededStores.add("Todo");
      IDBUtils.convertToArray(query.data.todos.set).forEach((setWhere) => {
        this.client.todo._getNeededStoresForWhere(setWhere, neededStores);
      });
    }
    if (query.data?.todos?.updateMany) {
      neededStores.add("Todo");
      IDBUtils.convertToArray(query.data.todos.updateMany).forEach((update) => {
        this.client.todo
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.TodoDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.todos?.update) {
      neededStores.add("Todo");
      IDBUtils.convertToArray(query.data.todos.update).forEach((update) => {
        this.client.todo
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.TodoDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.todos?.upsert) {
      neededStores.add("Todo");
      IDBUtils.convertToArray(query.data.todos.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.TodoDelegate,
          "update"
        >;
        this.client.todo._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.profile?.delete) {
      this.client.profile._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.posts?.delete || query.data?.posts?.deleteMany) {
      this.client.post._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.comments?.delete || query.data?.comments?.deleteMany) {
      this.client.comment._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.Child?.delete || query.data?.Child?.deleteMany) {
      this.client.child._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.Father?.delete || query.data?.Father?.deleteMany) {
      this.client.father._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.Mother?.delete || query.data?.Mother?.deleteMany) {
      this.client.mother._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.groups?.delete || query.data?.groups?.deleteMany) {
      this.client.userGroup._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.todos?.delete || query.data?.todos?.deleteMany) {
      this.client.todo._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.id !== undefined) {
      neededStores.add("UserGroup");
      neededStores.add("Profile");
      neededStores.add("Post");
      neededStores.add("Comment");
      neededStores.add("Father");
      neededStores.add("Mother");
      neededStores.add("Child");
      neededStores.add("Todo");
    }
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("User");
    this.client.profile._getNeededStoresForNestedDelete(neededStores);
    this.client.post._getNeededStoresForNestedDelete(neededStores);
    this.client.comment._getNeededStoresForNestedDelete(neededStores);
    this.client.child._getNeededStoresForNestedDelete(neededStores);
    this.client.father._getNeededStoresForNestedDelete(neededStores);
    this.client.mother._getNeededStoresForNestedDelete(neededStores);
    this.client.userGroup._getNeededStoresForNestedDelete(neededStores);
    this.client.todo._getNeededStoresForNestedDelete(neededStores);
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.UserDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate?.profile;
    delete recordWithoutNestedCreate?.posts;
    delete recordWithoutNestedCreate?.comments;
    delete recordWithoutNestedCreate?.Child;
    delete recordWithoutNestedCreate?.Father;
    delete recordWithoutNestedCreate?.Mother;
    delete recordWithoutNestedCreate?.groups;
    delete recordWithoutNestedCreate?.todos;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.UserDelegate, object, "findMany">): void {}
  async findMany<Q extends Prisma.Args<Prisma.UserDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("User").getAll(), query?.where, tx);
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.UserDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.UserDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.UserDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<Q extends Prisma.Args<Prisma.UserDelegate, "findFirstOrThrow">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.UserDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id !== undefined) {
      record = await tx.objectStore("User").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.UserDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.UserDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["User"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.UserDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.UserCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.UserDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.UserDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("User").add(record);
    if (query.data.profile?.create) {
      await this.client.profile.create(
        {
          data: { ...query.data.profile.create, userId: keyPath[0] } as Prisma.Args<
            Prisma.ProfileDelegate,
            "create"
          >["data"],
        },
        { tx, silent, addToOutbox },
      );
    }
    if (query.data.profile?.connect) {
      await this.client.profile.update(
        { where: query.data.profile.connect, data: { userId: keyPath[0] } },
        { tx, silent, addToOutbox },
      );
    }
    if (query.data.profile?.connectOrCreate) {
      await this.client.profile.upsert(
        {
          where: query.data.profile.connectOrCreate.where,
          create: { ...query.data.profile.connectOrCreate.create, userId: keyPath[0] } as Prisma.Args<
            Prisma.ProfileDelegate,
            "create"
          >["data"],
          update: { userId: keyPath[0] },
        },
        { tx, silent, addToOutbox },
      );
    }
    if (query.data?.posts?.create) {
      for (const elem of IDBUtils.convertToArray(query.data.posts.create)) {
        await this.client.post.create(
          {
            data: { ...elem, author: { connect: { id: keyPath[0] } } } as Prisma.Args<
              Prisma.PostDelegate,
              "create"
            >["data"],
          },
          { tx, silent, addToOutbox },
        );
      }
    }
    if (query.data?.posts?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.posts.connect).map(async (connectWhere) => {
          await this.client.post.update(
            { where: connectWhere, data: { authorId: keyPath[0] } },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.posts?.connectOrCreate) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.posts.connectOrCreate).map(async (connectOrCreate) => {
          await this.client.post.upsert(
            {
              where: connectOrCreate.where,
              create: { ...connectOrCreate.create, authorId: keyPath[0] } as NonNullable<
                Prisma.Args<Prisma.PostDelegate, "create">["data"]
              >,
              update: { authorId: keyPath[0] },
            },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.posts?.createMany) {
      await this.client.post.createMany(
        {
          data: IDBUtils.convertToArray(query.data.posts.createMany.data).map((createData) => ({
            ...createData,
            authorId: keyPath[0],
          })),
        },
        { tx, silent, addToOutbox },
      );
    }
    if (query.data?.comments?.create) {
      const createData = Array.isArray(query.data.comments.create)
        ? query.data.comments.create
        : [query.data.comments.create];
      for (const elem of createData) {
        await this.client.comment.create(
          {
            data: { ...elem, user: { connect: { id: keyPath[0] } } } as Prisma.Args<
              Prisma.CommentDelegate,
              "create"
            >["data"],
          },
          { tx, silent, addToOutbox },
        );
      }
    }
    if (query.data?.comments?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.comments.connect).map(async (connectWhere) => {
          await this.client.comment.update(
            { where: connectWhere, data: { userId: keyPath[0] } },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.comments?.connectOrCreate) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.comments.connectOrCreate).map(async (connectOrCreate) => {
          await this.client.comment.upsert(
            {
              where: connectOrCreate.where,
              create: { ...connectOrCreate.create, userId: keyPath[0] } as NonNullable<
                Prisma.Args<Prisma.CommentDelegate, "create">["data"]
              >,
              update: { userId: keyPath[0] },
            },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.comments?.createMany) {
      await this.client.comment.createMany(
        {
          data: IDBUtils.convertToArray(query.data.comments.createMany.data).map((createData) => ({
            ...createData,
            userId: keyPath[0],
          })),
        },
        { tx, silent, addToOutbox },
      );
    }
    if (query.data?.Mother?.create) {
      for (const elem of IDBUtils.convertToArray(query.data.Mother.create)) {
        await this.client.mother.create(
          {
            data: { ...elem, user: { connect: { id: keyPath[0] } } } as Prisma.Args<
              Prisma.MotherDelegate,
              "create"
            >["data"],
          },
          { tx, silent, addToOutbox },
        );
      }
    }
    if (query.data?.Mother?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.Mother.connect).map(async (connectWhere) => {
          await this.client.mother.update(
            { where: connectWhere, data: { userId: keyPath[0] } },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.Mother?.connectOrCreate) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.Mother.connectOrCreate).map(async (connectOrCreate) => {
          await this.client.mother.upsert(
            {
              where: connectOrCreate.where,
              create: { ...connectOrCreate.create, userId: keyPath[0] } as NonNullable<
                Prisma.Args<Prisma.MotherDelegate, "create">["data"]
              >,
              update: { userId: keyPath[0] },
            },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.Mother?.createMany) {
      await this.client.mother.createMany(
        {
          data: IDBUtils.convertToArray(query.data.Mother.createMany.data).map((createData) => ({
            ...createData,
            userId: keyPath[0],
          })),
        },
        { tx, silent, addToOutbox },
      );
    }
    if (query.data?.Father?.create) {
      const createData = Array.isArray(query.data.Father.create)
        ? query.data.Father.create
        : [query.data.Father.create];
      for (const elem of createData) {
        await this.client.father.create(
          {
            data: { ...elem, user: { connect: { id: keyPath[0] } } } as Prisma.Args<
              Prisma.FatherDelegate,
              "create"
            >["data"],
          },
          { tx, silent, addToOutbox },
        );
      }
    }
    if (query.data?.Father?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.Father.connect).map(async (connectWhere) => {
          await this.client.father.update(
            { where: connectWhere, data: { userId: keyPath[0] } },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.Father?.connectOrCreate) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.Father.connectOrCreate).map(async (connectOrCreate) => {
          await this.client.father.upsert(
            {
              where: connectOrCreate.where,
              create: { ...connectOrCreate.create, userId: keyPath[0] } as NonNullable<
                Prisma.Args<Prisma.FatherDelegate, "create">["data"]
              >,
              update: { userId: keyPath[0] },
            },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.Father?.createMany) {
      await this.client.father.createMany(
        {
          data: IDBUtils.convertToArray(query.data.Father.createMany.data).map((createData) => ({
            ...createData,
            userId: keyPath[0],
          })),
        },
        { tx, silent, addToOutbox },
      );
    }
    if (query.data?.Child?.create) {
      const createData = Array.isArray(query.data.Child.create) ? query.data.Child.create : [query.data.Child.create];
      for (const elem of createData) {
        await this.client.child.create(
          {
            data: { ...elem, user: { connect: { id: keyPath[0] } } } as Prisma.Args<
              Prisma.ChildDelegate,
              "create"
            >["data"],
          },
          { tx, silent, addToOutbox },
        );
      }
    }
    if (query.data?.Child?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.Child.connect).map(async (connectWhere) => {
          await this.client.child.update(
            { where: connectWhere, data: { userId: keyPath[0] } },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.Child?.connectOrCreate) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.Child.connectOrCreate).map(async (connectOrCreate) => {
          await this.client.child.upsert(
            {
              where: connectOrCreate.where,
              create: { ...connectOrCreate.create, userId: keyPath[0] } as NonNullable<
                Prisma.Args<Prisma.ChildDelegate, "create">["data"]
              >,
              update: { userId: keyPath[0] },
            },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.Child?.createMany) {
      await this.client.child.createMany(
        {
          data: IDBUtils.convertToArray(query.data.Child.createMany.data).map((createData) => ({
            ...createData,
            userId: keyPath[0],
          })),
        },
        { tx, silent, addToOutbox },
      );
    }
    if (query.data?.groups?.create) {
      const createData = Array.isArray(query.data.groups.create)
        ? query.data.groups.create
        : [query.data.groups.create];
      for (const elem of createData) {
        await this.client.userGroup.create(
          {
            data: { ...elem, user: { connect: { id: keyPath[0] } } } as Prisma.Args<
              Prisma.UserGroupDelegate,
              "create"
            >["data"],
          },
          { tx, silent, addToOutbox },
        );
      }
    }
    if (query.data?.groups?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.groups.connect).map(async (connectWhere) => {
          await this.client.userGroup.update(
            { where: connectWhere, data: { userId: keyPath[0] } },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.groups?.connectOrCreate) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.groups.connectOrCreate).map(async (connectOrCreate) => {
          await this.client.userGroup.upsert(
            {
              where: connectOrCreate.where,
              create: { ...connectOrCreate.create, userId: keyPath[0] } as NonNullable<
                Prisma.Args<Prisma.UserGroupDelegate, "create">["data"]
              >,
              update: { userId: keyPath[0] },
            },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.groups?.createMany) {
      await this.client.userGroup.createMany(
        {
          data: IDBUtils.convertToArray(query.data.groups.createMany.data).map((createData) => ({
            ...createData,
            userId: keyPath[0],
          })),
        },
        { tx, silent, addToOutbox },
      );
    }
    if (query.data?.todos?.create) {
      for (const elem of IDBUtils.convertToArray(query.data.todos.create)) {
        await this.client.todo.create(
          {
            data: { ...elem, user: { connect: { id: keyPath[0] } } } as Prisma.Args<
              Prisma.TodoDelegate,
              "create"
            >["data"],
          },
          { tx, silent, addToOutbox },
        );
      }
    }
    if (query.data?.todos?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.todos.connect).map(async (connectWhere) => {
          await this.client.todo.update(
            { where: connectWhere, data: { userId: keyPath[0] } },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.todos?.connectOrCreate) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.todos.connectOrCreate).map(async (connectOrCreate) => {
          await this.client.todo.upsert(
            {
              where: connectOrCreate.where,
              create: { ...connectOrCreate.create, userId: keyPath[0] } as NonNullable<
                Prisma.Args<Prisma.TodoDelegate, "create">["data"]
              >,
              update: { userId: keyPath[0] },
            },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.todos?.createMany) {
      await this.client.todo.createMany(
        {
          data: IDBUtils.convertToArray(query.data.todos.createMany.data).map((createData) => ({
            ...createData,
            userId: keyPath[0],
          })),
        },
        { tx, silent, addToOutbox },
      );
    }
    const data = (await tx.objectStore("User").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.UserDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["User"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("User").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.UserDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.UserDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["User"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("User").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<Prisma.UserDelegate, Q, "createManyAndReturn">;
  }
  async delete<Q extends Prisma.Args<Prisma.UserDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    const relatedUserGroup = await this.client.userGroup.findMany({ where: { userId: record.id } }, { tx });
    if (relatedUserGroup.length) throw new Error("Cannot delete record, other records depend on it");
    await this.client.profile.deleteMany(
      {
        where: { userId: record.id },
      },
      { tx, silent, addToOutbox },
    );
    await this.client.post.updateMany(
      {
        where: { authorId: record.id },
        data: { authorId: null },
      },
      { tx, silent, addToOutbox },
    );
    await this.client.comment.updateMany(
      {
        where: { userId: record.id },
        data: { userId: 0 },
      },
      { tx, silent, addToOutbox },
    );
    await this.client.father.updateMany(
      {
        where: { userId: record.id },
        data: { userId: null },
      },
      { tx, silent, addToOutbox },
    );
    await this.client.mother.updateMany(
      {
        where: { userId: record.id },
        data: { userId: null },
      },
      { tx, silent, addToOutbox },
    );
    await this.client.child.updateMany(
      {
        where: { userId: record.id },
        data: { userId: null },
      },
      { tx, silent, addToOutbox },
    );
    await this.client.todo.deleteMany(
      {
        where: { userId: record.id },
      },
      { tx, silent, addToOutbox },
    );
    await tx.objectStore("User").delete([record.id]);
    await this.emit("delete", [record.id], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.UserDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete({ where: { id: record.id } }, { tx, silent, addToOutbox });
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.UserDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["User"]["key"] = [record.id];
    const stringFields = ["name"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const intFields = ["id"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    if (query.data.profile) {
      if (query.data.profile.connect) {
        await this.client.profile.update(
          { where: query.data.profile.connect, data: { userId: record.id } },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.profile.disconnect) {
        throw new Error("Cannot disconnect required relation");
      }
      if (query.data.profile.create) {
        await this.client.profile.create(
          {
            data: { ...query.data.profile.create, userId: record.id } as Prisma.Args<
              Prisma.ProfileDelegate,
              "create"
            >["data"],
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.profile.delete) {
        const deleteWhere = query.data.profile.delete === true ? {} : query.data.profile.delete;
        await this.client.profile.delete(
          { where: { ...deleteWhere, userId: record.id } as Prisma.ProfileWhereUniqueInput },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.profile.update) {
        const updateData = query.data.profile.update.data ?? query.data.profile.update;
        await this.client.profile.update(
          {
            where: { ...query.data.profile.update.where, userId: record.id } as Prisma.ProfileWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.profile.upsert) {
        await this.client.profile.upsert(
          {
            ...query.data.profile.upsert,
            where: { ...query.data.profile.upsert.where, userId: record.id } as Prisma.ProfileWhereUniqueInput,
            create: { ...query.data.profile.upsert.create, userId: record.id } as Prisma.Args<
              Prisma.ProfileDelegate,
              "upsert"
            >["create"],
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.profile.connectOrCreate) {
        await this.client.profile.upsert(
          {
            where: { ...query.data.profile.connectOrCreate.where, userId: record.id } as Prisma.ProfileWhereUniqueInput,
            create: { ...query.data.profile.connectOrCreate.create, userId: record.id } as Prisma.Args<
              Prisma.ProfileDelegate,
              "upsert"
            >["create"],
            update: { userId: record.id },
          },
          { tx, silent, addToOutbox },
        );
      }
    }
    if (query.data.posts) {
      if (query.data.posts.connect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.posts.connect).map(async (connectWhere) => {
            await this.client.post.update(
              { where: connectWhere, data: { authorId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.posts.disconnect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.posts.disconnect).map(async (connectWhere) => {
            await this.client.post.update(
              { where: connectWhere, data: { authorId: null } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.posts.create) {
        const createData = Array.isArray(query.data.posts.create) ? query.data.posts.create : [query.data.posts.create];
        for (const elem of createData) {
          await this.client.post.create(
            { data: { ...elem, authorId: record.id } as Prisma.Args<Prisma.PostDelegate, "create">["data"] },
            { tx, silent, addToOutbox },
          );
        }
      }
      if (query.data.posts.createMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.posts.createMany.data).map(async (createData) => {
            await this.client.post.create(
              { data: { ...createData, authorId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.posts.update) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.posts.update).map(async (updateData) => {
            await this.client.post.update(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.posts.updateMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.posts.updateMany).map(async (updateData) => {
            await this.client.post.updateMany(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.posts.upsert) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.posts.upsert).map(async (upsertData) => {
            await this.client.post.upsert(
              {
                ...upsertData,
                where: { ...upsertData.where, authorId: record.id },
                create: { ...upsertData.create, authorId: record.id } as Prisma.Args<
                  Prisma.PostDelegate,
                  "upsert"
                >["create"],
              },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.posts.delete) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.posts.delete).map(async (deleteData) => {
            await this.client.post.delete(
              { where: { ...deleteData, authorId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.posts.deleteMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.posts.deleteMany).map(async (deleteData) => {
            await this.client.post.deleteMany(
              { where: { ...deleteData, authorId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.posts.set) {
        const existing = await this.client.post.findMany({ where: { authorId: record.id } }, { tx });
        if (existing.length > 0) {
          await this.client.post.updateMany(
            { where: { authorId: record.id }, data: { authorId: null } },
            { tx, silent, addToOutbox },
          );
        }
        await Promise.all(
          IDBUtils.convertToArray(query.data.posts.set).map(async (setData) => {
            await this.client.post.update(
              { where: setData, data: { authorId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
    }
    if (query.data.comments) {
      if (query.data.comments.connect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.connect).map(async (connectWhere) => {
            await this.client.comment.update(
              { where: connectWhere, data: { userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.comments.disconnect) {
        throw new Error("Cannot disconnect required relation");
      }
      if (query.data.comments.create) {
        const createData = Array.isArray(query.data.comments.create)
          ? query.data.comments.create
          : [query.data.comments.create];
        for (const elem of createData) {
          await this.client.comment.create(
            { data: { ...elem, userId: record.id } as Prisma.Args<Prisma.CommentDelegate, "create">["data"] },
            { tx, silent, addToOutbox },
          );
        }
      }
      if (query.data.comments.createMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.createMany.data).map(async (createData) => {
            await this.client.comment.create(
              { data: { ...createData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.comments.update) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.update).map(async (updateData) => {
            await this.client.comment.update(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.comments.updateMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.updateMany).map(async (updateData) => {
            await this.client.comment.updateMany(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.comments.upsert) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.upsert).map(async (upsertData) => {
            await this.client.comment.upsert(
              {
                ...upsertData,
                where: { ...upsertData.where, userId: record.id },
                create: { ...upsertData.create, userId: record.id } as Prisma.Args<
                  Prisma.CommentDelegate,
                  "upsert"
                >["create"],
              },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.comments.delete) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.delete).map(async (deleteData) => {
            await this.client.comment.delete(
              { where: { ...deleteData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.comments.deleteMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.deleteMany).map(async (deleteData) => {
            await this.client.comment.deleteMany(
              { where: { ...deleteData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.comments.set) {
        const existing = await this.client.comment.findMany({ where: { userId: record.id } }, { tx });
        if (existing.length > 0) {
          throw new Error("Cannot set required relation");
        }
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.set).map(async (setData) => {
            await this.client.comment.update(
              { where: setData, data: { userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
    }
    if (query.data.Child) {
      if (query.data.Child.connect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Child.connect).map(async (connectWhere) => {
            await this.client.child.update(
              { where: connectWhere, data: { userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Child.disconnect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Child.disconnect).map(async (connectWhere) => {
            await this.client.child.update(
              { where: connectWhere, data: { userId: null } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Child.create) {
        const createData = Array.isArray(query.data.Child.create) ? query.data.Child.create : [query.data.Child.create];
        for (const elem of createData) {
          await this.client.child.create(
            { data: { ...elem, userId: record.id } as Prisma.Args<Prisma.ChildDelegate, "create">["data"] },
            { tx, silent, addToOutbox },
          );
        }
      }
      if (query.data.Child.createMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Child.createMany.data).map(async (createData) => {
            await this.client.child.create({ data: { ...createData, userId: record.id } }, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.Child.update) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Child.update).map(async (updateData) => {
            await this.client.child.update(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.Child.updateMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Child.updateMany).map(async (updateData) => {
            await this.client.child.updateMany(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.Child.upsert) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Child.upsert).map(async (upsertData) => {
            await this.client.child.upsert(
              {
                ...upsertData,
                where: { ...upsertData.where, userId: record.id },
                create: { ...upsertData.create, userId: record.id } as Prisma.Args<
                  Prisma.ChildDelegate,
                  "upsert"
                >["create"],
              },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Child.delete) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Child.delete).map(async (deleteData) => {
            await this.client.child.delete(
              { where: { ...deleteData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Child.deleteMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Child.deleteMany).map(async (deleteData) => {
            await this.client.child.deleteMany(
              { where: { ...deleteData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Child.set) {
        const existing = await this.client.child.findMany({ where: { userId: record.id } }, { tx });
        if (existing.length > 0) {
          await this.client.child.updateMany(
            { where: { userId: record.id }, data: { userId: null } },
            { tx, silent, addToOutbox },
          );
        }
        await Promise.all(
          IDBUtils.convertToArray(query.data.Child.set).map(async (setData) => {
            await this.client.child.update(
              { where: setData, data: { userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
    }
    if (query.data.Father) {
      if (query.data.Father.connect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Father.connect).map(async (connectWhere) => {
            await this.client.father.update(
              { where: connectWhere, data: { userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Father.disconnect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Father.disconnect).map(async (connectWhere) => {
            await this.client.father.update(
              { where: connectWhere, data: { userId: null } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Father.create) {
        const createData = Array.isArray(query.data.Father.create)
          ? query.data.Father.create
          : [query.data.Father.create];
        for (const elem of createData) {
          await this.client.father.create(
            { data: { ...elem, userId: record.id } as Prisma.Args<Prisma.FatherDelegate, "create">["data"] },
            { tx, silent, addToOutbox },
          );
        }
      }
      if (query.data.Father.createMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Father.createMany.data).map(async (createData) => {
            await this.client.father.create(
              { data: { ...createData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Father.update) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Father.update).map(async (updateData) => {
            await this.client.father.update(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.Father.updateMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Father.updateMany).map(async (updateData) => {
            await this.client.father.updateMany(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.Father.upsert) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Father.upsert).map(async (upsertData) => {
            await this.client.father.upsert(
              {
                ...upsertData,
                where: { ...upsertData.where, userId: record.id },
                create: { ...upsertData.create, userId: record.id } as Prisma.Args<
                  Prisma.FatherDelegate,
                  "upsert"
                >["create"],
              },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Father.delete) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Father.delete).map(async (deleteData) => {
            await this.client.father.delete(
              { where: { ...deleteData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Father.deleteMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Father.deleteMany).map(async (deleteData) => {
            await this.client.father.deleteMany(
              { where: { ...deleteData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Father.set) {
        const existing = await this.client.father.findMany({ where: { userId: record.id } }, { tx });
        if (existing.length > 0) {
          await this.client.father.updateMany(
            { where: { userId: record.id }, data: { userId: null } },
            { tx, silent, addToOutbox },
          );
        }
        await Promise.all(
          IDBUtils.convertToArray(query.data.Father.set).map(async (setData) => {
            await this.client.father.update(
              { where: setData, data: { userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
    }
    if (query.data.Mother) {
      if (query.data.Mother.connect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Mother.connect).map(async (connectWhere) => {
            await this.client.mother.update(
              { where: connectWhere, data: { userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Mother.disconnect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Mother.disconnect).map(async (connectWhere) => {
            await this.client.mother.update(
              { where: connectWhere, data: { userId: null } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Mother.create) {
        const createData = Array.isArray(query.data.Mother.create)
          ? query.data.Mother.create
          : [query.data.Mother.create];
        for (const elem of createData) {
          await this.client.mother.create(
            { data: { ...elem, userId: record.id } as Prisma.Args<Prisma.MotherDelegate, "create">["data"] },
            { tx, silent, addToOutbox },
          );
        }
      }
      if (query.data.Mother.createMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Mother.createMany.data).map(async (createData) => {
            await this.client.mother.create(
              { data: { ...createData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Mother.update) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Mother.update).map(async (updateData) => {
            await this.client.mother.update(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.Mother.updateMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Mother.updateMany).map(async (updateData) => {
            await this.client.mother.updateMany(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.Mother.upsert) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Mother.upsert).map(async (upsertData) => {
            await this.client.mother.upsert(
              {
                ...upsertData,
                where: { ...upsertData.where, userId: record.id },
                create: { ...upsertData.create, userId: record.id } as Prisma.Args<
                  Prisma.MotherDelegate,
                  "upsert"
                >["create"],
              },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Mother.delete) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Mother.delete).map(async (deleteData) => {
            await this.client.mother.delete(
              { where: { ...deleteData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Mother.deleteMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.Mother.deleteMany).map(async (deleteData) => {
            await this.client.mother.deleteMany(
              { where: { ...deleteData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.Mother.set) {
        const existing = await this.client.mother.findMany({ where: { userId: record.id } }, { tx });
        if (existing.length > 0) {
          await this.client.mother.updateMany(
            { where: { userId: record.id }, data: { userId: null } },
            { tx, silent, addToOutbox },
          );
        }
        await Promise.all(
          IDBUtils.convertToArray(query.data.Mother.set).map(async (setData) => {
            await this.client.mother.update(
              { where: setData, data: { userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
    }
    if (query.data.groups) {
      if (query.data.groups.connect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.groups.connect).map(async (connectWhere) => {
            await this.client.userGroup.update(
              { where: connectWhere, data: { userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.groups.disconnect) {
        throw new Error("Cannot disconnect required relation");
      }
      if (query.data.groups.create) {
        const createData = Array.isArray(query.data.groups.create)
          ? query.data.groups.create
          : [query.data.groups.create];
        for (const elem of createData) {
          await this.client.userGroup.create(
            { data: { ...elem, userId: record.id } as Prisma.Args<Prisma.UserGroupDelegate, "create">["data"] },
            { tx, silent, addToOutbox },
          );
        }
      }
      if (query.data.groups.createMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.groups.createMany.data).map(async (createData) => {
            await this.client.userGroup.create(
              { data: { ...createData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.groups.update) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.groups.update).map(async (updateData) => {
            await this.client.userGroup.update(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.groups.updateMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.groups.updateMany).map(async (updateData) => {
            await this.client.userGroup.updateMany(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.groups.upsert) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.groups.upsert).map(async (upsertData) => {
            await this.client.userGroup.upsert(
              {
                ...upsertData,
                where: { ...upsertData.where, userId: record.id },
                create: { ...upsertData.create, userId: record.id } as Prisma.Args<
                  Prisma.UserGroupDelegate,
                  "upsert"
                >["create"],
              },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.groups.delete) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.groups.delete).map(async (deleteData) => {
            await this.client.userGroup.delete(
              { where: { ...deleteData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.groups.deleteMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.groups.deleteMany).map(async (deleteData) => {
            await this.client.userGroup.deleteMany(
              { where: { ...deleteData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.groups.set) {
        const existing = await this.client.userGroup.findMany({ where: { userId: record.id } }, { tx });
        if (existing.length > 0) {
          throw new Error("Cannot set required relation");
        }
        await Promise.all(
          IDBUtils.convertToArray(query.data.groups.set).map(async (setData) => {
            await this.client.userGroup.update(
              { where: setData, data: { userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
    }
    if (query.data.todos) {
      if (query.data.todos.connect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.todos.connect).map(async (connectWhere) => {
            await this.client.todo.update(
              { where: connectWhere, data: { userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.todos.disconnect) {
        throw new Error("Cannot disconnect required relation");
      }
      if (query.data.todos.create) {
        const createData = Array.isArray(query.data.todos.create) ? query.data.todos.create : [query.data.todos.create];
        for (const elem of createData) {
          await this.client.todo.create(
            { data: { ...elem, userId: record.id } as Prisma.Args<Prisma.TodoDelegate, "create">["data"] },
            { tx, silent, addToOutbox },
          );
        }
      }
      if (query.data.todos.createMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.todos.createMany.data).map(async (createData) => {
            await this.client.todo.create({ data: { ...createData, userId: record.id } }, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.todos.update) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.todos.update).map(async (updateData) => {
            await this.client.todo.update(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.todos.updateMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.todos.updateMany).map(async (updateData) => {
            await this.client.todo.updateMany(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.todos.upsert) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.todos.upsert).map(async (upsertData) => {
            await this.client.todo.upsert(
              {
                ...upsertData,
                where: { ...upsertData.where, userId: record.id },
                create: { ...upsertData.create, userId: record.id } as Prisma.Args<
                  Prisma.TodoDelegate,
                  "upsert"
                >["create"],
              },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.todos.delete) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.todos.delete).map(async (deleteData) => {
            await this.client.todo.delete({ where: { ...deleteData, userId: record.id } }, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.todos.deleteMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.todos.deleteMany).map(async (deleteData) => {
            await this.client.todo.deleteMany(
              { where: { ...deleteData, userId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.todos.set) {
        const existing = await this.client.todo.findMany({ where: { userId: record.id } }, { tx });
        if (existing.length > 0) {
          throw new Error("Cannot set required relation");
        }
        await Promise.all(
          IDBUtils.convertToArray(query.data.todos.set).map(async (setData) => {
            await this.client.todo.update({ where: setData, data: { userId: record.id } }, { tx, silent, addToOutbox });
          }),
        );
      }
    }
    const endKeyPath: PrismaIDBSchema["User"]["key"] = [record.id];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("User").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("User").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("User").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        await this.client.userGroup.updateMany(
          {
            where: { userId: startKeyPath[0] },
            data: { userId: endKeyPath[0] },
          },
          { tx, silent, addToOutbox },
        );
        await this.client.profile.updateMany(
          {
            where: { userId: startKeyPath[0] },
            data: { userId: endKeyPath[0] },
          },
          { tx, silent, addToOutbox },
        );
        await this.client.post.updateMany(
          {
            where: { authorId: startKeyPath[0] },
            data: { authorId: endKeyPath[0] },
          },
          { tx, silent, addToOutbox },
        );
        await this.client.comment.updateMany(
          {
            where: { userId: startKeyPath[0] },
            data: { userId: endKeyPath[0] },
          },
          { tx, silent, addToOutbox },
        );
        await this.client.father.updateMany(
          {
            where: { userId: startKeyPath[0] },
            data: { userId: endKeyPath[0] },
          },
          { tx, silent, addToOutbox },
        );
        await this.client.mother.updateMany(
          {
            where: { userId: startKeyPath[0] },
            data: { userId: endKeyPath[0] },
          },
          { tx, silent, addToOutbox },
        );
        await this.client.child.updateMany(
          {
            where: { userId: startKeyPath[0] },
            data: { userId: endKeyPath[0] },
          },
          { tx, silent, addToOutbox },
        );
        await this.client.todo.updateMany(
          {
            where: { userId: startKeyPath[0] },
            data: { userId: endKeyPath[0] },
          },
          { tx, silent, addToOutbox },
        );
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { id: keyPath[0] },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.UserDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update({ where: { id: record.id }, data: query.data }, { tx, silent, addToOutbox });
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.UserDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<Prisma.UserDelegate, "update">["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow(
      { where: { id: record.id }, select: query.select, include: query.include },
      { tx },
    );
    return record as Prisma.Result<Prisma.UserDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.UserDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["User"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.UserDelegate, Q, "aggregate">> = {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<Prisma.UserDelegate, Q, "aggregate">["_min"];
      const numericFields = ["id"] as const;
      for (const field of numericFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as number) = Math.min(...values);
      }
      const stringFields = ["name"] as const;
      for (const field of stringFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as string) = values.sort()[0];
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<Prisma.UserDelegate, Q, "aggregate">["_max"];
      const numericFields = ["id"] as const;
      for (const field of numericFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);
      }
      const stringFields = ["name"] as const;
      for (const field of stringFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
      }
      result._max = maxResult;
    }
    if (query?._avg) {
      const avgResult = {} as Prisma.Result<Prisma.UserDelegate, Q, "aggregate">["_avg"];
      for (const untypedField of Object.keys(query._avg)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;
      }
      result._avg = avgResult;
    }
    if (query?._sum) {
      const sumResult = {} as Prisma.Result<Prisma.UserDelegate, Q, "aggregate">["_sum"];
      for (const untypedField of Object.keys(query._sum)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);
      }
      result._sum = sumResult;
    }
    return result as unknown as Prisma.Result<Prisma.UserDelegate, Q, "aggregate">;
  }
}
class GroupIDBClass extends BaseIDBModelClass<"Group"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "Group");
  }

  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.GroupDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.GroupDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.GroupDelegate, R, W>(
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
          if (whereClause.userGroups) {
            if (whereClause.userGroups.every) {
              const violatingRecord = await this.client.userGroup.findFirst(
                {
                  where: { NOT: { ...whereClause.userGroups.every }, groupId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
            if (whereClause.userGroups.some) {
              const relatedRecords = await this.client.userGroup.findMany(
                {
                  where: { ...whereClause.userGroups.some, groupId: record.id },
                },
                { tx },
              );
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.userGroups.none) {
              const violatingRecord = await this.client.userGroup.findFirst(
                {
                  where: { ...whereClause.userGroups.none, groupId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
  }
  private _applySelectClause<S extends Prisma.Args<Prisma.GroupDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.GroupDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.GroupDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.GroupDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of ["id", "name", "userGroups"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.GroupDelegate, { select: S }, "findFirstOrThrow">[];
  }
  private async _applyRelations<Q extends Prisma.Args<Prisma.GroupDelegate, "findMany">>(
    records: Prisma.Result<Prisma.GroupDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.TransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.GroupDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_userGroups = query.select?.userGroups || query.include?.userGroups;
      if (attach_userGroups) {
        unsafeRecord["userGroups"] = await this.client.userGroup.findMany(
          {
            ...(attach_userGroups === true ? {} : attach_userGroups),
            where: { groupId: record.id! },
          },
          { tx },
        );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.GroupDelegate, Q, "findFirstOrThrow">[];
  }
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.GroupDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.GroupDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.GroupDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.GroupOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = ["id", "name"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
    if (orderByInput.userGroups) {
      return await this.client.userGroup.count({ where: { groupId: record.id } }, { tx });
    }
  }
  _resolveSortOrder(
    orderByInput: Prisma.GroupOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = ["id", "name"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    if (orderByInput.userGroups?._count) {
      return orderByInput.userGroups._count;
    }
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.GroupDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.id === undefined) {
      const transaction = tx ?? this.client._db.transaction(["Group"], "readwrite");
      const store = transaction.objectStore("Group");
      const cursor = await store.openCursor(null, "prev");
      data.id = cursor ? Number(cursor.key) + 1 : 1;
    }
    return data;
  }
  _getNeededStoresForWhere<W extends Prisma.Args<Prisma.GroupDelegate, "findMany">["where"]>(
    whereClause: W,
    neededStores: Set<StoreNames<PrismaIDBSchema>>,
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
    if (whereClause.userGroups) {
      neededStores.add("UserGroup");
      this.client.userGroup._getNeededStoresForWhere(whereClause.userGroups.every, neededStores);
      this.client.userGroup._getNeededStoresForWhere(whereClause.userGroups.some, neededStores);
      this.client.userGroup._getNeededStoresForWhere(whereClause.userGroups.none, neededStores);
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.GroupDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Group");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
      const orderBy_userGroups = orderBy.find((clause) => clause.userGroups);
      if (orderBy_userGroups) {
        neededStores.add("UserGroup");
      }
    }
    if (query?.select?.userGroups || query?.include?.userGroups) {
      neededStores.add("UserGroup");
      if (typeof query.select?.userGroups === "object") {
        this.client.userGroup
          ._getNeededStoresForFind(query.select.userGroups)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.userGroups === "object") {
        this.client.userGroup
          ._getNeededStoresForFind(query.include.userGroups)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    return neededStores;
  }
  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.GroupDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Group");
    if (data?.userGroups) {
      neededStores.add("UserGroup");
      if (data.userGroups.create) {
        const createData = Array.isArray(data.userGroups.create) ? data.userGroups.create : [data.userGroups.create];
        createData.forEach((record) =>
          this.client.userGroup._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.userGroups.connectOrCreate) {
        IDBUtils.convertToArray(data.userGroups.connectOrCreate).forEach((record) =>
          this.client.userGroup
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.userGroups.createMany) {
        IDBUtils.convertToArray(data.userGroups.createMany.data).forEach((record) =>
          this.client.userGroup._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.GroupDelegate, "update">>(
    query: Partial<Q>,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.GroupDelegate, "create">["data"]),
    );
    if (query.data?.userGroups?.connect) {
      neededStores.add("UserGroup");
      IDBUtils.convertToArray(query.data.userGroups.connect).forEach((connect) => {
        this.client.userGroup._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.userGroups?.set) {
      neededStores.add("UserGroup");
      IDBUtils.convertToArray(query.data.userGroups.set).forEach((setWhere) => {
        this.client.userGroup._getNeededStoresForWhere(setWhere, neededStores);
      });
    }
    if (query.data?.userGroups?.updateMany) {
      neededStores.add("UserGroup");
      IDBUtils.convertToArray(query.data.userGroups.updateMany).forEach((update) => {
        this.client.userGroup
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.UserGroupDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.userGroups?.update) {
      neededStores.add("UserGroup");
      IDBUtils.convertToArray(query.data.userGroups.update).forEach((update) => {
        this.client.userGroup
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.UserGroupDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.userGroups?.upsert) {
      neededStores.add("UserGroup");
      IDBUtils.convertToArray(query.data.userGroups.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.UserGroupDelegate,
          "update"
        >;
        this.client.userGroup._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.userGroups?.delete || query.data?.userGroups?.deleteMany) {
      this.client.userGroup._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.id !== undefined) {
      neededStores.add("UserGroup");
    }
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("Group");
    this.client.userGroup._getNeededStoresForNestedDelete(neededStores);
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.GroupDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.GroupDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate?.userGroups;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.GroupDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.GroupDelegate, object, "findMany">): void {}
  async findMany<Q extends Prisma.Args<Prisma.GroupDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("Group").getAll(), query?.where, tx);
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.GroupDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.GroupDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.GroupDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<Q extends Prisma.Args<Prisma.GroupDelegate, "findFirstOrThrow">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.GroupDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id !== undefined) {
      record = await tx.objectStore("Group").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.GroupDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.GroupDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.GroupDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Group"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.GroupDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.GroupCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.GroupDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.GroupDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("Group").add(record);
    if (query.data?.userGroups?.create) {
      const createData = Array.isArray(query.data.userGroups.create)
        ? query.data.userGroups.create
        : [query.data.userGroups.create];
      for (const elem of createData) {
        await this.client.userGroup.create(
          {
            data: { ...elem, group: { connect: { id: keyPath[0] } } } as Prisma.Args<
              Prisma.UserGroupDelegate,
              "create"
            >["data"],
          },
          { tx, silent, addToOutbox },
        );
      }
    }
    if (query.data?.userGroups?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.userGroups.connect).map(async (connectWhere) => {
          await this.client.userGroup.update(
            { where: connectWhere, data: { groupId: keyPath[0] } },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.userGroups?.connectOrCreate) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.userGroups.connectOrCreate).map(async (connectOrCreate) => {
          await this.client.userGroup.upsert(
            {
              where: connectOrCreate.where,
              create: { ...connectOrCreate.create, groupId: keyPath[0] } as NonNullable<
                Prisma.Args<Prisma.UserGroupDelegate, "create">["data"]
              >,
              update: { groupId: keyPath[0] },
            },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.userGroups?.createMany) {
      await this.client.userGroup.createMany(
        {
          data: IDBUtils.convertToArray(query.data.userGroups.createMany.data).map((createData) => ({
            ...createData,
            groupId: keyPath[0],
          })),
        },
        { tx, silent, addToOutbox },
      );
    }
    const data = (await tx.objectStore("Group").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<Prisma.GroupDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.GroupDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["Group"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Group").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.GroupDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.GroupDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["Group"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Group").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<Prisma.GroupDelegate, Q, "createManyAndReturn">;
  }
  async delete<Q extends Prisma.Args<Prisma.GroupDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    const relatedUserGroup = await this.client.userGroup.findMany({ where: { groupId: record.id } }, { tx });
    if (relatedUserGroup.length) throw new Error("Cannot delete record, other records depend on it");
    await tx.objectStore("Group").delete([record.id]);
    await this.emit("delete", [record.id], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.GroupDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete({ where: { id: record.id } }, { tx, silent, addToOutbox });
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.GroupDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["Group"]["key"] = [record.id];
    const stringFields = ["name"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const intFields = ["id"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    if (query.data.userGroups) {
      if (query.data.userGroups.connect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.userGroups.connect).map(async (connectWhere) => {
            await this.client.userGroup.update(
              { where: connectWhere, data: { groupId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.userGroups.disconnect) {
        throw new Error("Cannot disconnect required relation");
      }
      if (query.data.userGroups.create) {
        const createData = Array.isArray(query.data.userGroups.create)
          ? query.data.userGroups.create
          : [query.data.userGroups.create];
        for (const elem of createData) {
          await this.client.userGroup.create(
            { data: { ...elem, groupId: record.id } as Prisma.Args<Prisma.UserGroupDelegate, "create">["data"] },
            { tx, silent, addToOutbox },
          );
        }
      }
      if (query.data.userGroups.createMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.userGroups.createMany.data).map(async (createData) => {
            await this.client.userGroup.create(
              { data: { ...createData, groupId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.userGroups.update) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.userGroups.update).map(async (updateData) => {
            await this.client.userGroup.update(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.userGroups.updateMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.userGroups.updateMany).map(async (updateData) => {
            await this.client.userGroup.updateMany(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.userGroups.upsert) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.userGroups.upsert).map(async (upsertData) => {
            await this.client.userGroup.upsert(
              {
                ...upsertData,
                where: { ...upsertData.where, groupId: record.id },
                create: { ...upsertData.create, groupId: record.id } as Prisma.Args<
                  Prisma.UserGroupDelegate,
                  "upsert"
                >["create"],
              },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.userGroups.delete) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.userGroups.delete).map(async (deleteData) => {
            await this.client.userGroup.delete(
              { where: { ...deleteData, groupId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.userGroups.deleteMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.userGroups.deleteMany).map(async (deleteData) => {
            await this.client.userGroup.deleteMany(
              { where: { ...deleteData, groupId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.userGroups.set) {
        const existing = await this.client.userGroup.findMany({ where: { groupId: record.id } }, { tx });
        if (existing.length > 0) {
          throw new Error("Cannot set required relation");
        }
        await Promise.all(
          IDBUtils.convertToArray(query.data.userGroups.set).map(async (setData) => {
            await this.client.userGroup.update(
              { where: setData, data: { groupId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
    }
    const endKeyPath: PrismaIDBSchema["Group"]["key"] = [record.id];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("Group").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("Group").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("Group").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        await this.client.userGroup.updateMany(
          {
            where: { groupId: startKeyPath[0] },
            data: { groupId: endKeyPath[0] },
          },
          { tx, silent, addToOutbox },
        );
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { id: keyPath[0] },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.GroupDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.GroupDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update({ where: { id: record.id }, data: query.data }, { tx, silent, addToOutbox });
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.GroupDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<Prisma.GroupDelegate, "update">["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow(
      { where: { id: record.id }, select: query.select, include: query.include },
      { tx },
    );
    return record as Prisma.Result<Prisma.GroupDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.GroupDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.GroupDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Group"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.GroupDelegate, Q, "aggregate">> = {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<Prisma.GroupDelegate, Q, "aggregate">["_min"];
      const numericFields = ["id"] as const;
      for (const field of numericFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as number) = Math.min(...values);
      }
      const stringFields = ["name"] as const;
      for (const field of stringFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as string) = values.sort()[0];
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<Prisma.GroupDelegate, Q, "aggregate">["_max"];
      const numericFields = ["id"] as const;
      for (const field of numericFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);
      }
      const stringFields = ["name"] as const;
      for (const field of stringFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
      }
      result._max = maxResult;
    }
    if (query?._avg) {
      const avgResult = {} as Prisma.Result<Prisma.GroupDelegate, Q, "aggregate">["_avg"];
      for (const untypedField of Object.keys(query._avg)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;
      }
      result._avg = avgResult;
    }
    if (query?._sum) {
      const sumResult = {} as Prisma.Result<Prisma.GroupDelegate, Q, "aggregate">["_sum"];
      for (const untypedField of Object.keys(query._sum)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);
      }
      result._sum = sumResult;
    }
    return result as unknown as Prisma.Result<Prisma.GroupDelegate, Q, "aggregate">;
  }
}
class UserGroupIDBClass extends BaseIDBModelClass<"UserGroup"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "UserGroup");
  }

  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.UserGroupDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.UserGroupDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.UserGroupDelegate, R, W>(
      records,
      whereClause,
      tx,
      this.keyPath,
      this._applyWhereClause.bind(this),
    );
    return (
      await Promise.all(
        records.map(async (record) => {
          const numberFields = ["groupId", "userId"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          const dateTimeFields = ["joinedOn"] as const;
          for (const field of dateTimeFields) {
            if (!IDBUtils.whereDateTimeFilter(record, field, whereClause[field])) return null;
          }
          if (whereClause.group) {
            const { is, isNot, ...rest } = whereClause.group;
            if (is !== null && is !== undefined) {
              const relatedRecord = await this.client.group.findFirst({ where: { ...is, id: record.groupId } }, { tx });
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.group.findFirst(
                { where: { ...isNot, id: record.groupId } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              const relatedRecord = await this.client.group.findFirst(
                { where: { ...whereClause.group, id: record.groupId } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
          }
          if (whereClause.user) {
            const { is, isNot, ...rest } = whereClause.user;
            if (is !== null && is !== undefined) {
              const relatedRecord = await this.client.user.findFirst({ where: { ...is, id: record.userId } }, { tx });
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...isNot, id: record.userId } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...whereClause.user, id: record.userId } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
  }
  private _applySelectClause<S extends Prisma.Args<Prisma.UserGroupDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.UserGroupDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.UserGroupDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.UserGroupDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of ["group", "groupId", "user", "userId", "joinedOn"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.UserGroupDelegate, { select: S }, "findFirstOrThrow">[];
  }
  private async _applyRelations<Q extends Prisma.Args<Prisma.UserGroupDelegate, "findMany">>(
    records: Prisma.Result<Prisma.UserGroupDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.TransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.UserGroupDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_group = query.select?.group || query.include?.group;
      if (attach_group) {
        unsafeRecord["group"] = await this.client.group.findUnique(
          {
            ...(attach_group === true ? {} : attach_group),
            where: { id: record.groupId! },
          },
          { tx },
        );
      }
      const attach_user = query.select?.user || query.include?.user;
      if (attach_user) {
        unsafeRecord["user"] = await this.client.user.findUnique(
          {
            ...(attach_user === true ? {} : attach_user),
            where: { id: record.userId! },
          },
          { tx },
        );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<
      Prisma.UserGroupDelegate,
      Q,
      "findFirstOrThrow"
    >[];
  }
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.UserGroupDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.UserGroupDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.UserGroupDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.UserGroupOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = ["groupId", "userId", "joinedOn"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
    if (orderByInput.group) {
      return await this.client.group._resolveOrderByKey(
        await this.client.group.findFirstOrThrow({ where: { id: record.groupId } }),
        orderByInput.group,
        tx,
      );
    }
    if (orderByInput.user) {
      return await this.client.user._resolveOrderByKey(
        await this.client.user.findFirstOrThrow({ where: { id: record.userId } }),
        orderByInput.user,
        tx,
      );
    }
  }
  _resolveSortOrder(
    orderByInput: Prisma.UserGroupOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = ["groupId", "userId", "joinedOn"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    if (orderByInput.group) {
      return this.client.group._resolveSortOrder(orderByInput.group);
    }
    if (orderByInput.user) {
      return this.client.user._resolveSortOrder(orderByInput.user);
    }
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.UserGroupDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.joinedOn === undefined) {
      data.joinedOn = new Date();
    }
    if (typeof data.joinedOn === "string") {
      data.joinedOn = new Date(data.joinedOn);
    }
    return data;
  }
  _getNeededStoresForWhere<W extends Prisma.Args<Prisma.UserGroupDelegate, "findMany">["where"]>(
    whereClause: W,
    neededStores: Set<StoreNames<PrismaIDBSchema>>,
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
    if (whereClause.group) {
      neededStores.add("Group");
      this.client.group._getNeededStoresForWhere(whereClause.group, neededStores);
    }
    if (whereClause.user) {
      neededStores.add("User");
      this.client.user._getNeededStoresForWhere(whereClause.user, neededStores);
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.UserGroupDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("UserGroup");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
      const orderBy_group = orderBy.find((clause) => clause.group);
      if (orderBy_group) {
        this.client.group
          ._getNeededStoresForFind({ orderBy: orderBy_group.group })
          .forEach((storeName) => neededStores.add(storeName));
      }
      const orderBy_user = orderBy.find((clause) => clause.user);
      if (orderBy_user) {
        this.client.user
          ._getNeededStoresForFind({ orderBy: orderBy_user.user })
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.group || query?.include?.group) {
      neededStores.add("Group");
      if (typeof query.select?.group === "object") {
        this.client.group
          ._getNeededStoresForFind(query.select.group)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.group === "object") {
        this.client.group
          ._getNeededStoresForFind(query.include.group)
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
  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.UserGroupDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("UserGroup");
    if (data?.group) {
      neededStores.add("Group");
      if (data.group.create) {
        const createData = Array.isArray(data.group.create) ? data.group.create : [data.group.create];
        createData.forEach((record) =>
          this.client.group._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.group.connectOrCreate) {
        IDBUtils.convertToArray(data.group.connectOrCreate).forEach((record) =>
          this.client.group
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data?.groupId !== undefined) {
      neededStores.add("Group");
    }
    if (data?.user) {
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
    if (data?.userId !== undefined) {
      neededStores.add("User");
    }
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.UserGroupDelegate, "update">>(
    query: Partial<Q>,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.UserGroupDelegate, "create">["data"]),
    );
    if (query.data?.group?.connect) {
      neededStores.add("Group");
      IDBUtils.convertToArray(query.data.group.connect).forEach((connect) => {
        this.client.group._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.group?.update) {
      neededStores.add("Group");
      IDBUtils.convertToArray(query.data.group.update).forEach((update) => {
        this.client.group
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.GroupDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.group?.upsert) {
      neededStores.add("Group");
      IDBUtils.convertToArray(query.data.group.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.GroupDelegate,
          "update"
        >;
        this.client.group._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.user?.connect) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.connect).forEach((connect) => {
        this.client.user._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.user?.update) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.update).forEach((update) => {
        this.client.user
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.UserDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.user?.upsert) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.UserDelegate,
          "update"
        >;
        this.client.user._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("UserGroup");
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.UserGroupDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.UserGroupDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate?.group;
    delete recordWithoutNestedCreate?.user;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.UserGroupDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.UserGroupDelegate, object, "findMany">): void {}
  async findMany<Q extends Prisma.Args<Prisma.UserGroupDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("UserGroup").getAll(), query?.where, tx);
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.UserGroupDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.UserGroupDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.UserGroupDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<Q extends Prisma.Args<Prisma.UserGroupDelegate, "findFirstOrThrow">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.UserGroupDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.groupId_userId !== undefined) {
      record = await tx
        .objectStore("UserGroup")
        .get([query.where.groupId_userId.groupId, query.where.groupId_userId.userId]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.UserGroupDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.UserGroupDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.UserGroupDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["UserGroup"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.UserGroupDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.UserGroupCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.UserGroupDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.UserGroupDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    if (query.data.group) {
      const fk: Partial<PrismaIDBSchema["Group"]["key"]> = [];
      if (query.data.group?.create) {
        const record = await this.client.group.create({ data: query.data.group.create }, { tx, silent, addToOutbox });
        fk[0] = record.id;
      }
      if (query.data.group?.connect) {
        const record = await this.client.group.findUniqueOrThrow({ where: query.data.group.connect }, { tx });
        delete query.data.group.connect;
        fk[0] = record.id;
      }
      if (query.data.group?.connectOrCreate) {
        const record = await this.client.group.upsert(
          {
            where: query.data.group.connectOrCreate.where,
            create: query.data.group.connectOrCreate.create,
            update: {},
          },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.id;
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.groupId = fk[0];
      delete unsafeData.group;
    } else if (query.data?.groupId !== undefined && query.data.groupId !== null) {
      await this.client.group.findUniqueOrThrow(
        {
          where: { id: query.data.groupId },
        },
        { tx },
      );
    }
    if (query.data.user) {
      const fk: Partial<PrismaIDBSchema["User"]["key"]> = [];
      if (query.data.user?.create) {
        const record = await this.client.user.create({ data: query.data.user.create }, { tx, silent, addToOutbox });
        fk[0] = record.id;
      }
      if (query.data.user?.connect) {
        const record = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, { tx });
        delete query.data.user.connect;
        fk[0] = record.id;
      }
      if (query.data.user?.connectOrCreate) {
        const record = await this.client.user.upsert(
          {
            where: query.data.user.connectOrCreate.where,
            create: query.data.user.connectOrCreate.create,
            update: {},
          },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.id;
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.userId = fk[0];
      delete unsafeData.user;
    } else if (query.data?.userId !== undefined && query.data.userId !== null) {
      await this.client.user.findUniqueOrThrow(
        {
          where: { id: query.data.userId },
        },
        { tx },
      );
    }
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("UserGroup").add(record);
    const data = (await tx.objectStore("UserGroup").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<Prisma.UserGroupDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.UserGroupDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["UserGroup"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("UserGroup").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.UserGroupDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.UserGroupDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["UserGroup"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("UserGroup").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<Prisma.UserGroupDelegate, Q, "createManyAndReturn">;
  }
  async delete<Q extends Prisma.Args<Prisma.UserGroupDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    await tx.objectStore("UserGroup").delete([record.groupId, record.userId]);
    await this.emit("delete", [record.groupId, record.userId], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.UserGroupDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete(
        { where: { groupId_userId: { groupId: record.groupId, userId: record.userId } } },
        { tx, silent, addToOutbox },
      );
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.UserGroupDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["UserGroup"]["key"] = [record.groupId, record.userId];
    const dateTimeFields = ["joinedOn"] as const;
    for (const field of dateTimeFields) {
      IDBUtils.handleDateTimeUpdateField(record, field, query.data[field]);
    }
    const intFields = ["groupId", "userId"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    if (query.data.group) {
      if (query.data.group.connect) {
        const other = await this.client.group.findUniqueOrThrow({ where: query.data.group.connect }, { tx });
        record.groupId = other.id;
      }
      if (query.data.group.create) {
        const other = await this.client.group.create({ data: query.data.group.create }, { tx, silent, addToOutbox });
        record.groupId = other.id;
      }
      if (query.data.group.update) {
        const updateData = query.data.group.update.data ?? query.data.group.update;
        await this.client.group.update(
          {
            where: { ...query.data.group.update.where, id: record.groupId! } as Prisma.GroupWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.group.upsert) {
        await this.client.group.upsert(
          {
            where: { ...query.data.group.upsert.where, id: record.groupId! } as Prisma.GroupWhereUniqueInput,
            create: { ...query.data.group.upsert.create, id: record.groupId! } as Prisma.Args<
              Prisma.GroupDelegate,
              "upsert"
            >["create"],
            update: query.data.group.upsert.update,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.group.connectOrCreate) {
        await this.client.group.upsert(
          {
            where: { ...query.data.group.connectOrCreate.where, id: record.groupId! },
            create: { ...query.data.group.connectOrCreate.create, id: record.groupId! } as Prisma.Args<
              Prisma.GroupDelegate,
              "upsert"
            >["create"],
            update: { id: record.groupId! },
          },
          { tx: tx, silent, addToOutbox },
        );
      }
    }
    if (query.data.user) {
      if (query.data.user.connect) {
        const other = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, { tx });
        record.userId = other.id;
      }
      if (query.data.user.create) {
        const other = await this.client.user.create({ data: query.data.user.create }, { tx, silent, addToOutbox });
        record.userId = other.id;
      }
      if (query.data.user.update) {
        const updateData = query.data.user.update.data ?? query.data.user.update;
        await this.client.user.update(
          {
            where: { ...query.data.user.update.where, id: record.userId! } as Prisma.UserWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.user.upsert) {
        await this.client.user.upsert(
          {
            where: { ...query.data.user.upsert.where, id: record.userId! } as Prisma.UserWhereUniqueInput,
            create: { ...query.data.user.upsert.create, id: record.userId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: query.data.user.upsert.update,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.user.connectOrCreate) {
        await this.client.user.upsert(
          {
            where: { ...query.data.user.connectOrCreate.where, id: record.userId! },
            create: { ...query.data.user.connectOrCreate.create, id: record.userId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: { id: record.userId! },
          },
          { tx: tx, silent, addToOutbox },
        );
      }
    }
    if (query.data.groupId !== undefined) {
      const related = await this.client.group.findUnique({ where: { id: record.groupId } }, { tx });
      if (!related) throw new Error("Related record not found");
    }
    if (query.data.userId !== undefined) {
      const related = await this.client.user.findUnique({ where: { id: record.userId } }, { tx });
      if (!related) throw new Error("Related record not found");
    }
    const endKeyPath: PrismaIDBSchema["UserGroup"]["key"] = [record.groupId, record.userId];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("UserGroup").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("UserGroup").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("UserGroup").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { groupId_userId: { groupId: keyPath[0], userId: keyPath[1] } },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.UserGroupDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.UserGroupDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update(
          { where: { groupId_userId: { groupId: record.groupId, userId: record.userId } }, data: query.data },
          { tx, silent, addToOutbox },
        );
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.UserGroupDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<Prisma.UserGroupDelegate, "update">["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow(
      {
        where: { groupId_userId: { groupId: record.groupId, userId: record.userId } },
        select: query.select,
        include: query.include,
      },
      { tx },
    );
    return record as Prisma.Result<Prisma.UserGroupDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.UserGroupDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.UserGroupDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["UserGroup"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.UserGroupDelegate, Q, "aggregate">> = {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<Prisma.UserGroupDelegate, Q, "aggregate">["_min"];
      const numericFields = ["groupId", "userId"] as const;
      for (const field of numericFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as number) = Math.min(...values);
      }
      const dateTimeFields = ["joinedOn"] as const;
      for (const field of dateTimeFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field]?.getTime()).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as Date) = new Date(Math.min(...values));
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<Prisma.UserGroupDelegate, Q, "aggregate">["_max"];
      const numericFields = ["groupId", "userId"] as const;
      for (const field of numericFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);
      }
      const dateTimeFields = ["joinedOn"] as const;
      for (const field of dateTimeFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field]?.getTime()).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as Date) = new Date(Math.max(...values));
      }
      result._max = maxResult;
    }
    if (query?._avg) {
      const avgResult = {} as Prisma.Result<Prisma.UserGroupDelegate, Q, "aggregate">["_avg"];
      for (const untypedField of Object.keys(query._avg)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;
      }
      result._avg = avgResult;
    }
    if (query?._sum) {
      const sumResult = {} as Prisma.Result<Prisma.UserGroupDelegate, Q, "aggregate">["_sum"];
      for (const untypedField of Object.keys(query._sum)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);
      }
      result._sum = sumResult;
    }
    return result as unknown as Prisma.Result<Prisma.UserGroupDelegate, Q, "aggregate">;
  }
}
class ProfileIDBClass extends BaseIDBModelClass<"Profile"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "Profile");
  }

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
              const relatedRecord = await this.client.user.findFirst({ where: { ...is, id: record.userId } }, { tx });
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...isNot, id: record.userId } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...whereClause.user, id: record.userId } },
                { tx },
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
            where: { id: record.userId! },
          },
          { tx },
        );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.ProfileDelegate, Q, "findFirstOrThrow">[];
  }
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.ProfileDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.ProfileOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = ["id", "bio", "userId"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
    if (orderByInput.user) {
      return await this.client.user._resolveOrderByKey(
        await this.client.user.findFirstOrThrow({ where: { id: record.userId } }),
        orderByInput.user,
        tx,
      );
    }
  }
  _resolveSortOrder(
    orderByInput: Prisma.ProfileOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = ["id", "bio", "userId"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    if (orderByInput.user) {
      return this.client.user._resolveSortOrder(orderByInput.user);
    }
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.ProfileDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
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
    return data;
  }
  _getNeededStoresForWhere<W extends Prisma.Args<Prisma.ProfileDelegate, "findMany">["where"]>(
    whereClause: W,
    neededStores: Set<StoreNames<PrismaIDBSchema>>,
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
    if (whereClause.user) {
      neededStores.add("User");
      this.client.user._getNeededStoresForWhere(whereClause.user, neededStores);
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.ProfileDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Profile");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
      const orderBy_user = orderBy.find((clause) => clause.user);
      if (orderBy_user) {
        this.client.user
          ._getNeededStoresForFind({ orderBy: orderBy_user.user })
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
  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.ProfileDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Profile");
    if (data?.user) {
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
    if (data?.userId !== undefined) {
      neededStores.add("User");
    }
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.ProfileDelegate, "update">>(
    query: Partial<Q>,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.ProfileDelegate, "create">["data"]),
    );
    if (query.data?.user?.connect) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.connect).forEach((connect) => {
        this.client.user._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.user?.update) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.update).forEach((update) => {
        this.client.user
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.UserDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.user?.upsert) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.UserDelegate,
          "update"
        >;
        this.client.user._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("Profile");
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.ProfileDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate?.user;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.ProfileDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.ProfileDelegate, object, "findMany">): void {}
  async findMany<Q extends Prisma.Args<Prisma.ProfileDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("Profile").getAll(), query?.where, tx);
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.ProfileDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.ProfileDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.ProfileDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<Q extends Prisma.Args<Prisma.ProfileDelegate, "findFirstOrThrow">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.ProfileDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id !== undefined) {
      record = await tx.objectStore("Profile").get([query.where.id]);
    } else if (query.where.userId !== undefined) {
      record = await tx.objectStore("Profile").index("userIdIndex").get([query.where.userId]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.ProfileDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.ProfileDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.ProfileDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Profile"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.ProfileDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.ProfileCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.ProfileDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.ProfileDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    if (query.data.user) {
      const fk: Partial<PrismaIDBSchema["User"]["key"]> = [];
      if (query.data.user?.create) {
        const record = await this.client.user.create({ data: query.data.user.create }, { tx, silent, addToOutbox });
        fk[0] = record.id;
      }
      if (query.data.user?.connect) {
        const record = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, { tx });
        delete query.data.user.connect;
        fk[0] = record.id;
      }
      if (query.data.user?.connectOrCreate) {
        const record = await this.client.user.upsert(
          {
            where: query.data.user.connectOrCreate.where,
            create: query.data.user.connectOrCreate.create,
            update: {},
          },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.id;
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.userId = fk[0];
      delete unsafeData.user;
    } else if (query.data?.userId !== undefined && query.data.userId !== null) {
      await this.client.user.findUniqueOrThrow(
        {
          where: { id: query.data.userId },
        },
        { tx },
      );
    }
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("Profile").add(record);
    const data = (await tx.objectStore("Profile").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<Prisma.ProfileDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.ProfileDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["Profile"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Profile").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.ProfileDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.ProfileDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["Profile"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Profile").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<Prisma.ProfileDelegate, Q, "createManyAndReturn">;
  }
  async delete<Q extends Prisma.Args<Prisma.ProfileDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    await tx.objectStore("Profile").delete([record.id]);
    await this.emit("delete", [record.id], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.ProfileDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete({ where: { id: record.id } }, { tx, silent, addToOutbox });
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.ProfileDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["Profile"]["key"] = [record.id];
    const stringFields = ["bio"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const intFields = ["id", "userId"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    if (query.data.user) {
      if (query.data.user.connect) {
        const other = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, { tx });
        record.userId = other.id;
      }
      if (query.data.user.create) {
        const other = await this.client.user.create({ data: query.data.user.create }, { tx, silent, addToOutbox });
        record.userId = other.id;
      }
      if (query.data.user.update) {
        const updateData = query.data.user.update.data ?? query.data.user.update;
        await this.client.user.update(
          {
            where: { ...query.data.user.update.where, id: record.userId! } as Prisma.UserWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.user.upsert) {
        await this.client.user.upsert(
          {
            where: { ...query.data.user.upsert.where, id: record.userId! } as Prisma.UserWhereUniqueInput,
            create: { ...query.data.user.upsert.create, id: record.userId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: query.data.user.upsert.update,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.user.connectOrCreate) {
        await this.client.user.upsert(
          {
            where: { ...query.data.user.connectOrCreate.where, id: record.userId! },
            create: { ...query.data.user.connectOrCreate.create, id: record.userId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: { id: record.userId! },
          },
          { tx: tx, silent, addToOutbox },
        );
      }
    }
    if (query.data.userId !== undefined) {
      const related = await this.client.user.findUnique({ where: { id: record.userId } }, { tx });
      if (!related) throw new Error("Related record not found");
    }
    const endKeyPath: PrismaIDBSchema["Profile"]["key"] = [record.id];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("Profile").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("Profile").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("Profile").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { id: keyPath[0] },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.ProfileDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.ProfileDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update({ where: { id: record.id }, data: query.data }, { tx, silent, addToOutbox });
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.ProfileDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<Prisma.ProfileDelegate, "update">["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow(
      { where: { id: record.id }, select: query.select, include: query.include },
      { tx },
    );
    return record as Prisma.Result<Prisma.ProfileDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.ProfileDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ProfileDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Profile"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.ProfileDelegate, Q, "aggregate">> = {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<Prisma.ProfileDelegate, Q, "aggregate">["_min"];
      const numericFields = ["id", "userId"] as const;
      for (const field of numericFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as number) = Math.min(...values);
      }
      const stringFields = ["bio"] as const;
      for (const field of stringFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as string) = values.sort()[0];
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<Prisma.ProfileDelegate, Q, "aggregate">["_max"];
      const numericFields = ["id", "userId"] as const;
      for (const field of numericFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);
      }
      const stringFields = ["bio"] as const;
      for (const field of stringFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
      }
      result._max = maxResult;
    }
    if (query?._avg) {
      const avgResult = {} as Prisma.Result<Prisma.ProfileDelegate, Q, "aggregate">["_avg"];
      for (const untypedField of Object.keys(query._avg)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;
      }
      result._avg = avgResult;
    }
    if (query?._sum) {
      const sumResult = {} as Prisma.Result<Prisma.ProfileDelegate, Q, "aggregate">["_sum"];
      for (const untypedField of Object.keys(query._sum)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);
      }
      result._sum = sumResult;
    }
    return result as unknown as Prisma.Result<Prisma.ProfileDelegate, Q, "aggregate">;
  }
}
class PostIDBClass extends BaseIDBModelClass<"Post"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "Post");
  }

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
          const stringListFields = ["tags"] as const;
          for (const field of stringListFields) {
            if (!IDBUtils.whereStringListFilter(record, field, whereClause[field])) return null;
          }
          const numberFields = ["id", "authorId", "views"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          const numberListFields = ["numberArr"] as const;
          for (const field of numberListFields) {
            if (!IDBUtils.whereNumberListFilter(record, field, whereClause[field])) return null;
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
              const relatedRecord = await this.client.user.findFirst({ where: { ...is, id: record.authorId } }, { tx });
              if (!relatedRecord) return null;
            }
            if (isNot === null) {
              if (record.authorId === null) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              if (record.authorId === null) return null;
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...isNot, id: record.authorId } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              if (record.authorId === null) return null;
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...whereClause.author, id: record.authorId } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
          }
          if (whereClause.comments) {
            if (whereClause.comments.every) {
              const violatingRecord = await this.client.comment.findFirst(
                {
                  where: { NOT: { ...whereClause.comments.every }, postId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
            if (whereClause.comments.some) {
              const relatedRecords = await this.client.comment.findMany(
                {
                  where: { ...whereClause.comments.some, postId: record.id },
                },
                { tx },
              );
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.comments.none) {
              const violatingRecord = await this.client.comment.findFirst(
                {
                  where: { ...whereClause.comments.none, postId: record.id },
                },
                { tx },
              );
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
      for (const untypedKey of ["id", "title", "author", "authorId", "comments", "tags", "numberArr", "views"]) {
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
                  where: { id: record.authorId! },
                },
                { tx },
              );
      }
      const attach_comments = query.select?.comments || query.include?.comments;
      if (attach_comments) {
        unsafeRecord["comments"] = await this.client.comment.findMany(
          {
            ...(attach_comments === true ? {} : attach_comments),
            where: { postId: record.id! },
          },
          { tx },
        );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.PostDelegate, Q, "findFirstOrThrow">[];
  }
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.PostDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.PostOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = ["id", "title", "authorId", "tags", "numberArr", "views"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
    if (orderByInput.author) {
      return record.authorId === null
        ? null
        : await this.client.user._resolveOrderByKey(
            await this.client.user.findFirstOrThrow({ where: { id: record.authorId } }),
            orderByInput.author,
            tx,
          );
    }
    if (orderByInput.comments) {
      return await this.client.comment.count({ where: { postId: record.id } }, { tx });
    }
  }
  _resolveSortOrder(
    orderByInput: Prisma.PostOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = ["id", "title", "authorId", "tags", "numberArr", "views"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    if (orderByInput.author) {
      return this.client.user._resolveSortOrder(orderByInput.author);
    }
    if (orderByInput.comments?._count) {
      return orderByInput.comments._count;
    }
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.PostDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.id === undefined) {
      const transaction = tx ?? this.client._db.transaction(["Post"], "readwrite");
      const store = transaction.objectStore("Post");
      const cursor = await store.openCursor(null, "prev");
      data.id = cursor ? Number(cursor.key) + 1 : 1;
    }
    if (data.authorId === undefined) {
      data.authorId = null;
    }
    if (data.views === undefined) {
      data.views = null;
    }
    if (!Array.isArray(data.tags)) {
      data.tags = data.tags?.set;
    }
    if (!Array.isArray(data.numberArr)) {
      data.numberArr = data.numberArr?.set;
    }
    return data;
  }
  _getNeededStoresForWhere<W extends Prisma.Args<Prisma.PostDelegate, "findMany">["where"]>(
    whereClause: W,
    neededStores: Set<StoreNames<PrismaIDBSchema>>,
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
    if (whereClause.author) {
      neededStores.add("User");
      this.client.user._getNeededStoresForWhere(whereClause.author, neededStores);
    }
    if (whereClause.comments) {
      neededStores.add("Comment");
      this.client.comment._getNeededStoresForWhere(whereClause.comments.every, neededStores);
      this.client.comment._getNeededStoresForWhere(whereClause.comments.some, neededStores);
      this.client.comment._getNeededStoresForWhere(whereClause.comments.none, neededStores);
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.PostDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Post");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
      const orderBy_author = orderBy.find((clause) => clause.author);
      if (orderBy_author) {
        this.client.user
          ._getNeededStoresForFind({ orderBy: orderBy_author.author })
          .forEach((storeName) => neededStores.add(storeName));
      }
      const orderBy_comments = orderBy.find((clause) => clause.comments);
      if (orderBy_comments) {
        neededStores.add("Comment");
      }
    }
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
    if (data?.author) {
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
    if (data?.authorId !== undefined) {
      neededStores.add("User");
    }
    if (data?.comments) {
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
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.PostDelegate, "update">>(
    query: Partial<Q>,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.PostDelegate, "create">["data"]),
    );
    if (query.data?.author?.connect) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.author.connect).forEach((connect) => {
        this.client.user._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.author?.disconnect) {
      neededStores.add("User");
      if (query.data?.author?.disconnect !== true) {
        IDBUtils.convertToArray(query.data.author.disconnect).forEach((disconnect) => {
          this.client.user._getNeededStoresForWhere(disconnect, neededStores);
        });
      }
    }
    if (query.data?.author?.update) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.author.update).forEach((update) => {
        this.client.user
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.UserDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.author?.upsert) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.author.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.UserDelegate,
          "update"
        >;
        this.client.user._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.comments?.connect) {
      neededStores.add("Comment");
      IDBUtils.convertToArray(query.data.comments.connect).forEach((connect) => {
        this.client.comment._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.comments?.set) {
      neededStores.add("Comment");
      IDBUtils.convertToArray(query.data.comments.set).forEach((setWhere) => {
        this.client.comment._getNeededStoresForWhere(setWhere, neededStores);
      });
    }
    if (query.data?.comments?.updateMany) {
      neededStores.add("Comment");
      IDBUtils.convertToArray(query.data.comments.updateMany).forEach((update) => {
        this.client.comment
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.CommentDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.comments?.update) {
      neededStores.add("Comment");
      IDBUtils.convertToArray(query.data.comments.update).forEach((update) => {
        this.client.comment
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.CommentDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.comments?.upsert) {
      neededStores.add("Comment");
      IDBUtils.convertToArray(query.data.comments.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.CommentDelegate,
          "update"
        >;
        this.client.comment._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.author?.delete) {
      this.client.user._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.comments?.delete || query.data?.comments?.deleteMany) {
      this.client.comment._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.id !== undefined) {
      neededStores.add("Comment");
    }
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("Post");
    this.client.comment._getNeededStoresForNestedDelete(neededStores);
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.PostDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate?.author;
    delete recordWithoutNestedCreate?.comments;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.PostDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.PostDelegate, object, "findMany">): void {
    for (const record of records) {
      record.tags = record.tags ?? [];
      record.numberArr = record.numberArr ?? [];
    }
  }
  async findMany<Q extends Prisma.Args<Prisma.PostDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("Post").getAll(), query?.where, tx);
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.PostDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.PostDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.PostDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<Q extends Prisma.Args<Prisma.PostDelegate, "findFirstOrThrow">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.PostDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id !== undefined) {
      record = await tx.objectStore("Post").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.PostDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.PostDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.PostDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Post"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.PostDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.PostCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.PostDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.PostDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    if (query.data.author) {
      const fk: Partial<PrismaIDBSchema["User"]["key"]> = [];
      if (query.data.author?.create) {
        const record = await this.client.user.create({ data: query.data.author.create }, { tx, silent, addToOutbox });
        fk[0] = record.id;
      }
      if (query.data.author?.connect) {
        const record = await this.client.user.findUniqueOrThrow({ where: query.data.author.connect }, { tx });
        delete query.data.author.connect;
        fk[0] = record.id;
      }
      if (query.data.author?.connectOrCreate) {
        const record = await this.client.user.upsert(
          {
            where: query.data.author.connectOrCreate.where,
            create: query.data.author.connectOrCreate.create,
            update: {},
          },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.id;
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.authorId = fk[0];
      delete unsafeData.author;
    } else if (query.data?.authorId !== undefined && query.data.authorId !== null) {
      await this.client.user.findUniqueOrThrow(
        {
          where: { id: query.data.authorId },
        },
        { tx },
      );
    }
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("Post").add(record);
    if (query.data?.comments?.create) {
      const createData = Array.isArray(query.data.comments.create)
        ? query.data.comments.create
        : [query.data.comments.create];
      for (const elem of createData) {
        await this.client.comment.create(
          {
            data: { ...elem, post: { connect: { id: keyPath[0] } } } as Prisma.Args<
              Prisma.CommentDelegate,
              "create"
            >["data"],
          },
          { tx, silent, addToOutbox },
        );
      }
    }
    if (query.data?.comments?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.comments.connect).map(async (connectWhere) => {
          await this.client.comment.update(
            { where: connectWhere, data: { postId: keyPath[0] } },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.comments?.connectOrCreate) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.comments.connectOrCreate).map(async (connectOrCreate) => {
          await this.client.comment.upsert(
            {
              where: connectOrCreate.where,
              create: { ...connectOrCreate.create, postId: keyPath[0] } as NonNullable<
                Prisma.Args<Prisma.CommentDelegate, "create">["data"]
              >,
              update: { postId: keyPath[0] },
            },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.comments?.createMany) {
      await this.client.comment.createMany(
        {
          data: IDBUtils.convertToArray(query.data.comments.createMany.data).map((createData) => ({
            ...createData,
            postId: keyPath[0],
          })),
        },
        { tx, silent, addToOutbox },
      );
    }
    const data = (await tx.objectStore("Post").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<Prisma.PostDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.PostDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["Post"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Post").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.PostDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.PostDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["Post"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Post").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<Prisma.PostDelegate, Q, "createManyAndReturn">;
  }
  async delete<Q extends Prisma.Args<Prisma.PostDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    await this.client.comment.deleteMany(
      {
        where: { postId: record.id },
      },
      { tx, silent, addToOutbox },
    );
    await tx.objectStore("Post").delete([record.id]);
    await this.emit("delete", [record.id], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.PostDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete({ where: { id: record.id } }, { tx, silent, addToOutbox });
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.PostDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["Post"]["key"] = [record.id];
    const stringFields = ["title"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const intFields = ["id", "authorId", "views"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    const listFields = ["tags", "numberArr"] as const;
    for (const field of listFields) {
      IDBUtils.handleScalarListUpdateField(record, field, query.data[field]);
    }
    if (query.data.author) {
      if (query.data.author.connect) {
        const other = await this.client.user.findUniqueOrThrow({ where: query.data.author.connect }, { tx });
        record.authorId = other.id;
      }
      if (query.data.author.create) {
        const other = await this.client.user.create({ data: query.data.author.create }, { tx, silent, addToOutbox });
        record.authorId = other.id;
      }
      if (query.data.author.update) {
        const updateData = query.data.author.update.data ?? query.data.author.update;
        await this.client.user.update(
          {
            where: { ...query.data.author.update.where, id: record.authorId! } as Prisma.UserWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.author.upsert) {
        await this.client.user.upsert(
          {
            where: { ...query.data.author.upsert.where, id: record.authorId! } as Prisma.UserWhereUniqueInput,
            create: { ...query.data.author.upsert.create, id: record.authorId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: query.data.author.upsert.update,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.author.connectOrCreate) {
        await this.client.user.upsert(
          {
            where: { ...query.data.author.connectOrCreate.where, id: record.authorId! },
            create: { ...query.data.author.connectOrCreate.create, id: record.authorId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: { id: record.authorId! },
          },
          { tx: tx, silent, addToOutbox },
        );
      }
      if (query.data.author.disconnect) {
        record.authorId = null;
      }
      if (query.data.author.delete) {
        const deleteWhere = query.data.author.delete === true ? {} : query.data.author.delete;
        await this.client.user.delete({ where: { ...deleteWhere, id: record.authorId! } } as Prisma.UserDeleteArgs, {
          tx,
          silent,
          addToOutbox,
        });
        record.authorId = null;
      }
    }
    if (query.data.comments) {
      if (query.data.comments.connect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.connect).map(async (connectWhere) => {
            await this.client.comment.update(
              { where: connectWhere, data: { postId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.comments.disconnect) {
        throw new Error("Cannot disconnect required relation");
      }
      if (query.data.comments.create) {
        const createData = Array.isArray(query.data.comments.create)
          ? query.data.comments.create
          : [query.data.comments.create];
        for (const elem of createData) {
          await this.client.comment.create(
            { data: { ...elem, postId: record.id } as Prisma.Args<Prisma.CommentDelegate, "create">["data"] },
            { tx, silent, addToOutbox },
          );
        }
      }
      if (query.data.comments.createMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.createMany.data).map(async (createData) => {
            await this.client.comment.create(
              { data: { ...createData, postId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.comments.update) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.update).map(async (updateData) => {
            await this.client.comment.update(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.comments.updateMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.updateMany).map(async (updateData) => {
            await this.client.comment.updateMany(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.comments.upsert) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.upsert).map(async (upsertData) => {
            await this.client.comment.upsert(
              {
                ...upsertData,
                where: { ...upsertData.where, postId: record.id },
                create: { ...upsertData.create, postId: record.id } as Prisma.Args<
                  Prisma.CommentDelegate,
                  "upsert"
                >["create"],
              },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.comments.delete) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.delete).map(async (deleteData) => {
            await this.client.comment.delete(
              { where: { ...deleteData, postId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.comments.deleteMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.deleteMany).map(async (deleteData) => {
            await this.client.comment.deleteMany(
              { where: { ...deleteData, postId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.comments.set) {
        const existing = await this.client.comment.findMany({ where: { postId: record.id } }, { tx });
        if (existing.length > 0) {
          throw new Error("Cannot set required relation");
        }
        await Promise.all(
          IDBUtils.convertToArray(query.data.comments.set).map(async (setData) => {
            await this.client.comment.update(
              { where: setData, data: { postId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
    }
    if (query.data.authorId !== undefined && record.authorId !== null) {
      const related = await this.client.user.findUnique({ where: { id: record.authorId } }, { tx });
      if (!related) throw new Error("Related record not found");
    }
    const endKeyPath: PrismaIDBSchema["Post"]["key"] = [record.id];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("Post").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("Post").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("Post").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        await this.client.comment.updateMany(
          {
            where: { postId: startKeyPath[0] },
            data: { postId: endKeyPath[0] },
          },
          { tx, silent, addToOutbox },
        );
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { id: keyPath[0] },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.PostDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.PostDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update({ where: { id: record.id }, data: query.data }, { tx, silent, addToOutbox });
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.PostDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<Prisma.PostDelegate, "update">["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow(
      { where: { id: record.id }, select: query.select, include: query.include },
      { tx },
    );
    return record as Prisma.Result<Prisma.PostDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.PostDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.PostDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Post"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.PostDelegate, Q, "aggregate">> = {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<Prisma.PostDelegate, Q, "aggregate">["_min"];
      const numericFields = ["id", "authorId", "views"] as const;
      for (const field of numericFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as number) = Math.min(...values);
      }
      const stringFields = ["title"] as const;
      for (const field of stringFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as string) = values.sort()[0];
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<Prisma.PostDelegate, Q, "aggregate">["_max"];
      const numericFields = ["id", "authorId", "views"] as const;
      for (const field of numericFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);
      }
      const stringFields = ["title"] as const;
      for (const field of stringFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
      }
      result._max = maxResult;
    }
    if (query?._avg) {
      const avgResult = {} as Prisma.Result<Prisma.PostDelegate, Q, "aggregate">["_avg"];
      for (const untypedField of Object.keys(query._avg)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;
      }
      result._avg = avgResult;
    }
    if (query?._sum) {
      const sumResult = {} as Prisma.Result<Prisma.PostDelegate, Q, "aggregate">["_sum"];
      for (const untypedField of Object.keys(query._sum)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);
      }
      result._sum = sumResult;
    }
    return result as unknown as Prisma.Result<Prisma.PostDelegate, Q, "aggregate">;
  }
}
class CommentIDBClass extends BaseIDBModelClass<"Comment"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "Comment");
  }

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
              const relatedRecord = await this.client.post.findFirst({ where: { ...is, id: record.postId } }, { tx });
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.post.findFirst(
                { where: { ...isNot, id: record.postId } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              const relatedRecord = await this.client.post.findFirst(
                { where: { ...whereClause.post, id: record.postId } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
          }
          if (whereClause.user) {
            const { is, isNot, ...rest } = whereClause.user;
            if (is !== null && is !== undefined) {
              const relatedRecord = await this.client.user.findFirst({ where: { ...is, id: record.userId } }, { tx });
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...isNot, id: record.userId } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...whereClause.user, id: record.userId } },
                { tx },
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
            where: { id: record.postId! },
          },
          { tx },
        );
      }
      const attach_user = query.select?.user || query.include?.user;
      if (attach_user) {
        unsafeRecord["user"] = await this.client.user.findUnique(
          {
            ...(attach_user === true ? {} : attach_user),
            where: { id: record.userId! },
          },
          { tx },
        );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.CommentDelegate, Q, "findFirstOrThrow">[];
  }
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.CommentDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.CommentDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.CommentDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.CommentOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = ["id", "postId", "userId", "text"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
    if (orderByInput.post) {
      return await this.client.post._resolveOrderByKey(
        await this.client.post.findFirstOrThrow({ where: { id: record.postId } }),
        orderByInput.post,
        tx,
      );
    }
    if (orderByInput.user) {
      return await this.client.user._resolveOrderByKey(
        await this.client.user.findFirstOrThrow({ where: { id: record.userId } }),
        orderByInput.user,
        tx,
      );
    }
  }
  _resolveSortOrder(
    orderByInput: Prisma.CommentOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = ["id", "postId", "userId", "text"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    if (orderByInput.post) {
      return this.client.post._resolveSortOrder(orderByInput.post);
    }
    if (orderByInput.user) {
      return this.client.user._resolveSortOrder(orderByInput.user);
    }
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.CommentDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.id === undefined) {
      data.id = createId();
    }
    if (data.userId === undefined) {
      data.userId = 0;
    }
    return data;
  }
  _getNeededStoresForWhere<W extends Prisma.Args<Prisma.CommentDelegate, "findMany">["where"]>(
    whereClause: W,
    neededStores: Set<StoreNames<PrismaIDBSchema>>,
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
    if (whereClause.post) {
      neededStores.add("Post");
      this.client.post._getNeededStoresForWhere(whereClause.post, neededStores);
    }
    if (whereClause.user) {
      neededStores.add("User");
      this.client.user._getNeededStoresForWhere(whereClause.user, neededStores);
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.CommentDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Comment");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
      const orderBy_post = orderBy.find((clause) => clause.post);
      if (orderBy_post) {
        this.client.post
          ._getNeededStoresForFind({ orderBy: orderBy_post.post })
          .forEach((storeName) => neededStores.add(storeName));
      }
      const orderBy_user = orderBy.find((clause) => clause.user);
      if (orderBy_user) {
        this.client.user
          ._getNeededStoresForFind({ orderBy: orderBy_user.user })
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
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
    if (data?.post) {
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
    if (data?.postId !== undefined) {
      neededStores.add("Post");
    }
    if (data?.user) {
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
    if (data?.userId !== undefined) {
      neededStores.add("User");
    }
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.CommentDelegate, "update">>(
    query: Partial<Q>,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.CommentDelegate, "create">["data"]),
    );
    if (query.data?.post?.connect) {
      neededStores.add("Post");
      IDBUtils.convertToArray(query.data.post.connect).forEach((connect) => {
        this.client.post._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.post?.update) {
      neededStores.add("Post");
      IDBUtils.convertToArray(query.data.post.update).forEach((update) => {
        this.client.post
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.PostDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.post?.upsert) {
      neededStores.add("Post");
      IDBUtils.convertToArray(query.data.post.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.PostDelegate,
          "update"
        >;
        this.client.post._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.user?.connect) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.connect).forEach((connect) => {
        this.client.user._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.user?.update) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.update).forEach((update) => {
        this.client.user
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.UserDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.user?.upsert) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.UserDelegate,
          "update"
        >;
        this.client.user._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("Comment");
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.CommentDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.CommentDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate?.post;
    delete recordWithoutNestedCreate?.user;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.CommentDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.CommentDelegate, object, "findMany">): void {}
  async findMany<Q extends Prisma.Args<Prisma.CommentDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("Comment").getAll(), query?.where, tx);
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.CommentDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.CommentDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.CommentDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<Q extends Prisma.Args<Prisma.CommentDelegate, "findFirstOrThrow">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.CommentDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id !== undefined) {
      record = await tx.objectStore("Comment").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.CommentDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.CommentDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.CommentDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Comment"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.CommentDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.CommentCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.CommentDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.CommentDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    if (query.data.post) {
      const fk: Partial<PrismaIDBSchema["Post"]["key"]> = [];
      if (query.data.post?.create) {
        const record = await this.client.post.create({ data: query.data.post.create }, { tx, silent, addToOutbox });
        fk[0] = record.id;
      }
      if (query.data.post?.connect) {
        const record = await this.client.post.findUniqueOrThrow({ where: query.data.post.connect }, { tx });
        delete query.data.post.connect;
        fk[0] = record.id;
      }
      if (query.data.post?.connectOrCreate) {
        const record = await this.client.post.upsert(
          {
            where: query.data.post.connectOrCreate.where,
            create: query.data.post.connectOrCreate.create,
            update: {},
          },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.id;
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.postId = fk[0];
      delete unsafeData.post;
    } else if (query.data?.postId !== undefined && query.data.postId !== null) {
      await this.client.post.findUniqueOrThrow(
        {
          where: { id: query.data.postId },
        },
        { tx },
      );
    }
    if (query.data.user) {
      const fk: Partial<PrismaIDBSchema["User"]["key"]> = [];
      if (query.data.user?.create) {
        const record = await this.client.user.create({ data: query.data.user.create }, { tx, silent, addToOutbox });
        fk[0] = record.id;
      }
      if (query.data.user?.connect) {
        const record = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, { tx });
        delete query.data.user.connect;
        fk[0] = record.id;
      }
      if (query.data.user?.connectOrCreate) {
        const record = await this.client.user.upsert(
          {
            where: query.data.user.connectOrCreate.where,
            create: query.data.user.connectOrCreate.create,
            update: {},
          },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.id;
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.userId = fk[0];
      delete unsafeData.user;
    } else if (query.data?.userId !== undefined && query.data.userId !== null) {
      await this.client.user.findUniqueOrThrow(
        {
          where: { id: query.data.userId },
        },
        { tx },
      );
    }
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("Comment").add(record);
    const data = (await tx.objectStore("Comment").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<Prisma.CommentDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.CommentDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["Comment"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Comment").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.CommentDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.CommentDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["Comment"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Comment").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<Prisma.CommentDelegate, Q, "createManyAndReturn">;
  }
  async delete<Q extends Prisma.Args<Prisma.CommentDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    await tx.objectStore("Comment").delete([record.id]);
    await this.emit("delete", [record.id], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.CommentDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete({ where: { id: record.id } }, { tx, silent, addToOutbox });
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.CommentDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["Comment"]["key"] = [record.id];
    const stringFields = ["id", "text"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const intFields = ["postId", "userId"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    if (query.data.post) {
      if (query.data.post.connect) {
        const other = await this.client.post.findUniqueOrThrow({ where: query.data.post.connect }, { tx });
        record.postId = other.id;
      }
      if (query.data.post.create) {
        const other = await this.client.post.create({ data: query.data.post.create }, { tx, silent, addToOutbox });
        record.postId = other.id;
      }
      if (query.data.post.update) {
        const updateData = query.data.post.update.data ?? query.data.post.update;
        await this.client.post.update(
          {
            where: { ...query.data.post.update.where, id: record.postId! } as Prisma.PostWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.post.upsert) {
        await this.client.post.upsert(
          {
            where: { ...query.data.post.upsert.where, id: record.postId! } as Prisma.PostWhereUniqueInput,
            create: { ...query.data.post.upsert.create, id: record.postId! } as Prisma.Args<
              Prisma.PostDelegate,
              "upsert"
            >["create"],
            update: query.data.post.upsert.update,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.post.connectOrCreate) {
        await this.client.post.upsert(
          {
            where: { ...query.data.post.connectOrCreate.where, id: record.postId! },
            create: { ...query.data.post.connectOrCreate.create, id: record.postId! } as Prisma.Args<
              Prisma.PostDelegate,
              "upsert"
            >["create"],
            update: { id: record.postId! },
          },
          { tx: tx, silent, addToOutbox },
        );
      }
    }
    if (query.data.user) {
      if (query.data.user.connect) {
        const other = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, { tx });
        record.userId = other.id;
      }
      if (query.data.user.create) {
        const other = await this.client.user.create({ data: query.data.user.create }, { tx, silent, addToOutbox });
        record.userId = other.id;
      }
      if (query.data.user.update) {
        const updateData = query.data.user.update.data ?? query.data.user.update;
        await this.client.user.update(
          {
            where: { ...query.data.user.update.where, id: record.userId! } as Prisma.UserWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.user.upsert) {
        await this.client.user.upsert(
          {
            where: { ...query.data.user.upsert.where, id: record.userId! } as Prisma.UserWhereUniqueInput,
            create: { ...query.data.user.upsert.create, id: record.userId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: query.data.user.upsert.update,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.user.connectOrCreate) {
        await this.client.user.upsert(
          {
            where: { ...query.data.user.connectOrCreate.where, id: record.userId! },
            create: { ...query.data.user.connectOrCreate.create, id: record.userId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: { id: record.userId! },
          },
          { tx: tx, silent, addToOutbox },
        );
      }
    }
    if (query.data.postId !== undefined) {
      const related = await this.client.post.findUnique({ where: { id: record.postId } }, { tx });
      if (!related) throw new Error("Related record not found");
    }
    if (query.data.userId !== undefined) {
      const related = await this.client.user.findUnique({ where: { id: record.userId } }, { tx });
      if (!related) throw new Error("Related record not found");
    }
    const endKeyPath: PrismaIDBSchema["Comment"]["key"] = [record.id];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("Comment").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("Comment").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("Comment").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { id: keyPath[0] },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.CommentDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.CommentDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update({ where: { id: record.id }, data: query.data }, { tx, silent, addToOutbox });
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.CommentDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<Prisma.CommentDelegate, "update">["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow(
      { where: { id: record.id }, select: query.select, include: query.include },
      { tx },
    );
    return record as Prisma.Result<Prisma.CommentDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.CommentDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.CommentDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Comment"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.CommentDelegate, Q, "aggregate">> = {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<Prisma.CommentDelegate, Q, "aggregate">["_min"];
      const numericFields = ["postId", "userId"] as const;
      for (const field of numericFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as number) = Math.min(...values);
      }
      const stringFields = ["id", "text"] as const;
      for (const field of stringFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as string) = values.sort()[0];
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<Prisma.CommentDelegate, Q, "aggregate">["_max"];
      const numericFields = ["postId", "userId"] as const;
      for (const field of numericFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);
      }
      const stringFields = ["id", "text"] as const;
      for (const field of stringFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
      }
      result._max = maxResult;
    }
    if (query?._avg) {
      const avgResult = {} as Prisma.Result<Prisma.CommentDelegate, Q, "aggregate">["_avg"];
      for (const untypedField of Object.keys(query._avg)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;
      }
      result._avg = avgResult;
    }
    if (query?._sum) {
      const sumResult = {} as Prisma.Result<Prisma.CommentDelegate, Q, "aggregate">["_sum"];
      for (const untypedField of Object.keys(query._sum)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);
      }
      result._sum = sumResult;
    }
    return result as unknown as Prisma.Result<Prisma.CommentDelegate, Q, "aggregate">;
  }
}
class AllFieldScalarTypesIDBClass extends BaseIDBModelClass<"AllFieldScalarTypes"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "AllFieldScalarTypes");
  }

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
          const numberFields = ["id", "float"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          const numberListFields = ["floats"] as const;
          for (const field of numberListFields) {
            if (!IDBUtils.whereNumberListFilter(record, field, whereClause[field])) return null;
          }
          const bigIntFields = ["bigInt"] as const;
          for (const field of bigIntFields) {
            if (!IDBUtils.whereBigIntFilter(record, field, whereClause[field])) return null;
          }
          const bigIntListFields = ["bigIntegers"] as const;
          for (const field of bigIntListFields) {
            if (!IDBUtils.whereBigIntListFilter(record, field, whereClause[field])) return null;
          }
          const booleanFields = ["boolean"] as const;
          for (const field of booleanFields) {
            if (!IDBUtils.whereBoolFilter(record, field, whereClause[field])) return null;
          }
          const booleanListFields = ["booleans"] as const;
          for (const field of booleanListFields) {
            if (!IDBUtils.whereBooleanListFilter(record, field, whereClause[field])) return null;
          }
          const bytesFields = ["bytes"] as const;
          for (const field of bytesFields) {
            if (!IDBUtils.whereBytesFilter(record, field, whereClause[field])) return null;
          }
          const bytesListFields = ["manyBytes"] as const;
          for (const field of bytesListFields) {
            if (!IDBUtils.whereBytesListFilter(record, field, whereClause[field])) return null;
          }
          const dateTimeFields = ["dateTime"] as const;
          for (const field of dateTimeFields) {
            if (!IDBUtils.whereDateTimeFilter(record, field, whereClause[field])) return null;
          }
          const dateTimeListFields = ["dateTimes"] as const;
          for (const field of dateTimeListFields) {
            if (!IDBUtils.whereDateTimeListFilter(record, field, whereClause[field])) return null;
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
        "booleans",
        "bigInt",
        "bigIntegers",
        "float",
        "floats",
        "decimal",
        "decimals",
        "dateTime",
        "dateTimes",
        "json",
        "jsonS",
        "bytes",
        "manyBytes",
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
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.AllFieldScalarTypesDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.AllFieldScalarTypesDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.AllFieldScalarTypesOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = [
      "id",
      "string",
      "boolean",
      "booleans",
      "bigInt",
      "bigIntegers",
      "float",
      "floats",
      "decimal",
      "decimals",
      "dateTime",
      "dateTimes",
      "json",
      "jsonS",
      "bytes",
      "manyBytes",
    ] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
  }
  _resolveSortOrder(
    orderByInput: Prisma.AllFieldScalarTypesOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = [
      "id",
      "string",
      "boolean",
      "booleans",
      "bigInt",
      "bigIntegers",
      "float",
      "floats",
      "decimal",
      "decimals",
      "dateTime",
      "dateTimes",
      "json",
      "jsonS",
      "bytes",
      "manyBytes",
    ] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.id === undefined) {
      const transaction = tx ?? this.client._db.transaction(["AllFieldScalarTypes"], "readwrite");
      const store = transaction.objectStore("AllFieldScalarTypes");
      const cursor = await store.openCursor(null, "prev");
      data.id = cursor ? Number(cursor.key) + 1 : 1;
    }
    if (!Array.isArray(data.booleans)) {
      data.booleans = data.booleans?.set;
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
    if (!Array.isArray(data.floats)) {
      data.floats = data.floats?.set;
    }
    if (!Array.isArray(data.decimals)) {
      data.decimals = data.decimals?.set;
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
    if (!Array.isArray(data.jsonS)) {
      data.jsonS = data.jsonS?.set;
    }
    if (!Array.isArray(data.manyBytes)) {
      data.manyBytes = data.manyBytes?.set;
    }
    return data;
  }
  _getNeededStoresForWhere<W extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findMany">["where"]>(
    whereClause: W,
    neededStores: Set<StoreNames<PrismaIDBSchema>>,
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("AllFieldScalarTypes");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
    }
    return neededStores;
  }
  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("AllFieldScalarTypes");
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "update">>(
    query: Partial<Q>,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "create">["data"]),
    );
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("AllFieldScalarTypes");
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.AllFieldScalarTypesDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    return recordWithoutNestedCreate as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.AllFieldScalarTypesDelegate, object, "findMany">): void {
    for (const record of records) {
      record.booleans = record.booleans ?? [];
      record.bigIntegers = record.bigIntegers ?? [];
      record.floats = record.floats ?? [];
      record.decimals = record.decimals ?? [];
      record.dateTimes = record.dateTimes ?? [];
      record.jsonS = record.jsonS ?? [];
      record.manyBytes = record.manyBytes ?? [];
    }
  }
  async findMany<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(
      await tx.objectStore("AllFieldScalarTypes").getAll(),
      query?.where,
      tx,
    );
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.AllFieldScalarTypesDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findFirstOrThrow">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id !== undefined) {
      record = await tx.objectStore("AllFieldScalarTypes").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["AllFieldScalarTypes"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.AllFieldScalarTypesCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("AllFieldScalarTypes").add(record);
    const data = (await tx.objectStore("AllFieldScalarTypes").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["AllFieldScalarTypes"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("AllFieldScalarTypes").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.AllFieldScalarTypesDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["AllFieldScalarTypes"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("AllFieldScalarTypes").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "createManyAndReturn">;
  }
  async delete<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    await tx.objectStore("AllFieldScalarTypes").delete([record.id]);
    await this.emit("delete", [record.id], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete({ where: { id: record.id } }, { tx, silent, addToOutbox });
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["AllFieldScalarTypes"]["key"] = [record.id];
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
    const intFields = ["id"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    const bigIntFields = ["bigInt"] as const;
    for (const field of bigIntFields) {
      IDBUtils.handleBigIntUpdateField(record, field, query.data[field]);
    }
    const floatFields = ["float"] as const;
    for (const field of floatFields) {
      IDBUtils.handleFloatUpdateField(record, field, query.data[field]);
    }
    const listFields = ["booleans", "bigIntegers", "floats", "decimals", "dateTimes", "jsonS", "manyBytes"] as const;
    for (const field of listFields) {
      IDBUtils.handleScalarListUpdateField(record, field, query.data[field]);
    }
    const endKeyPath: PrismaIDBSchema["AllFieldScalarTypes"]["key"] = [record.id];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("AllFieldScalarTypes").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("AllFieldScalarTypes").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("AllFieldScalarTypes").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { id: keyPath[0] },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update({ where: { id: record.id }, data: query.data }, { tx, silent, addToOutbox });
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "update">["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow({ where: { id: record.id }, select: query.select }, { tx });
    return record as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.AllFieldScalarTypesDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["AllFieldScalarTypes"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "aggregate">> = {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "aggregate">["_min"];
      const numericFields = ["id", "float", "decimal"] as const;
      for (const field of numericFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as number) = Math.min(...values);
      }
      const dateTimeFields = ["dateTime"] as const;
      for (const field of dateTimeFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field]?.getTime()).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as Date) = new Date(Math.min(...values));
      }
      const stringFields = ["string"] as const;
      for (const field of stringFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as string) = values.sort()[0];
      }
      const booleanFields = ["boolean"] as const;
      for (const field of booleanFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as boolean).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as boolean) =
          values.length === 0 ? false : values.includes(false) ? false : true;
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "aggregate">["_max"];
      const numericFields = ["id", "float", "decimal"] as const;
      for (const field of numericFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);
      }
      const dateTimeFields = ["dateTime"] as const;
      for (const field of dateTimeFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field]?.getTime()).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as Date) = new Date(Math.max(...values));
      }
      const stringFields = ["string"] as const;
      for (const field of stringFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
      }
      const booleanFields = ["boolean"] as const;
      for (const field of booleanFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as boolean).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as boolean) = values.length === 0 ? false : values.includes(true);
      }
      result._max = maxResult;
    }
    if (query?._avg) {
      const avgResult = {} as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "aggregate">["_avg"];
      for (const untypedField of Object.keys(query._avg)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;
      }
      result._avg = avgResult;
    }
    if (query?._sum) {
      const sumResult = {} as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "aggregate">["_sum"];
      for (const untypedField of Object.keys(query._sum)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);
      }
      result._sum = sumResult;
    }
    return result as unknown as Prisma.Result<Prisma.AllFieldScalarTypesDelegate, Q, "aggregate">;
  }
}
class FatherIDBClass extends BaseIDBModelClass<"Father"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "Father");
  }

  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.FatherDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.FatherDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.FatherDelegate, R, W>(
      records,
      whereClause,
      tx,
      this.keyPath,
      this._applyWhereClause.bind(this),
    );
    return (
      await Promise.all(
        records.map(async (record) => {
          const stringFields = ["firstName", "lastName", "motherFirstName", "motherLastName"] as const;
          for (const field of stringFields) {
            if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;
          }
          const numberFields = ["userId"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          if (whereClause.children) {
            if (whereClause.children.every) {
              const violatingRecord = await this.client.child.findFirst(
                {
                  where: {
                    NOT: { ...whereClause.children.every },
                    fatherLastName: record.lastName,
                    fatherFirstName: record.firstName,
                  },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
            if (whereClause.children.some) {
              const relatedRecords = await this.client.child.findMany(
                {
                  where: {
                    ...whereClause.children.some,
                    fatherLastName: record.lastName,
                    fatherFirstName: record.firstName,
                  },
                },
                { tx },
              );
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.children.none) {
              const violatingRecord = await this.client.child.findFirst(
                {
                  where: {
                    ...whereClause.children.none,
                    fatherLastName: record.lastName,
                    fatherFirstName: record.firstName,
                  },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
          }
          if (whereClause.wife) {
            const { is, isNot, ...rest } = whereClause.wife;
            if (is !== null && is !== undefined) {
              const relatedRecord = await this.client.mother.findFirst(
                { where: { ...is, firstName: record.motherFirstName, lastName: record.motherLastName } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.mother.findFirst(
                { where: { ...isNot, firstName: record.motherFirstName, lastName: record.motherLastName } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              const relatedRecord = await this.client.mother.findFirst(
                { where: { ...whereClause.wife, firstName: record.motherFirstName, lastName: record.motherLastName } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
          }
          if (whereClause.user === null) {
            if (record.userId !== null) return null;
          }
          if (whereClause.user) {
            const { is, isNot, ...rest } = whereClause.user;
            if (is === null) {
              if (record.userId !== null) return null;
            }
            if (is !== null && is !== undefined) {
              if (record.userId === null) return null;
              const relatedRecord = await this.client.user.findFirst({ where: { ...is, id: record.userId } }, { tx });
              if (!relatedRecord) return null;
            }
            if (isNot === null) {
              if (record.userId === null) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              if (record.userId === null) return null;
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...isNot, id: record.userId } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              if (record.userId === null) return null;
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...whereClause.user, id: record.userId } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
  }
  private _applySelectClause<S extends Prisma.Args<Prisma.FatherDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.FatherDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.FatherDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.FatherDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of [
        "firstName",
        "lastName",
        "children",
        "wife",
        "motherFirstName",
        "motherLastName",
        "user",
        "userId",
      ]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.FatherDelegate, { select: S }, "findFirstOrThrow">[];
  }
  private async _applyRelations<Q extends Prisma.Args<Prisma.FatherDelegate, "findMany">>(
    records: Prisma.Result<Prisma.FatherDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.TransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.FatherDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_children = query.select?.children || query.include?.children;
      if (attach_children) {
        unsafeRecord["children"] = await this.client.child.findMany(
          {
            ...(attach_children === true ? {} : attach_children),
            where: { fatherLastName: record.lastName!, fatherFirstName: record.firstName! },
          },
          { tx },
        );
      }
      const attach_wife = query.select?.wife || query.include?.wife;
      if (attach_wife) {
        unsafeRecord["wife"] = await this.client.mother.findUnique(
          {
            ...(attach_wife === true ? {} : attach_wife),
            where: { firstName_lastName: { firstName: record.motherFirstName!, lastName: record.motherLastName! } },
          },
          { tx },
        );
      }
      const attach_user = query.select?.user || query.include?.user;
      if (attach_user) {
        unsafeRecord["user"] =
          record.userId === null
            ? null
            : await this.client.user.findUnique(
                {
                  ...(attach_user === true ? {} : attach_user),
                  where: { id: record.userId! },
                },
                { tx },
              );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.FatherDelegate, Q, "findFirstOrThrow">[];
  }
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.FatherDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.FatherDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.FatherDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.FatherOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = ["firstName", "lastName", "motherFirstName", "motherLastName", "userId"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
    if (orderByInput.wife) {
      return await this.client.mother._resolveOrderByKey(
        await this.client.mother.findFirstOrThrow({ where: { firstName: record.motherFirstName } }),
        orderByInput.wife,
        tx,
      );
    }
    if (orderByInput.user) {
      return record.userId === null
        ? null
        : await this.client.user._resolveOrderByKey(
            await this.client.user.findFirstOrThrow({ where: { id: record.userId } }),
            orderByInput.user,
            tx,
          );
    }
    if (orderByInput.children) {
      return await this.client.child.count(
        { where: { fatherLastName: record.lastName, fatherFirstName: record.firstName } },
        { tx },
      );
    }
  }
  _resolveSortOrder(
    orderByInput: Prisma.FatherOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = ["firstName", "lastName", "motherFirstName", "motherLastName", "userId"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    if (orderByInput.wife) {
      return this.client.mother._resolveSortOrder(orderByInput.wife);
    }
    if (orderByInput.user) {
      return this.client.user._resolveSortOrder(orderByInput.user);
    }
    if (orderByInput.children?._count) {
      return orderByInput.children._count;
    }
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.FatherDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.userId === undefined) {
      data.userId = null;
    }
    return data;
  }
  _getNeededStoresForWhere<W extends Prisma.Args<Prisma.FatherDelegate, "findMany">["where"]>(
    whereClause: W,
    neededStores: Set<StoreNames<PrismaIDBSchema>>,
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
    if (whereClause.children) {
      neededStores.add("Child");
      this.client.child._getNeededStoresForWhere(whereClause.children.every, neededStores);
      this.client.child._getNeededStoresForWhere(whereClause.children.some, neededStores);
      this.client.child._getNeededStoresForWhere(whereClause.children.none, neededStores);
    }
    if (whereClause.wife) {
      neededStores.add("Mother");
      this.client.mother._getNeededStoresForWhere(whereClause.wife, neededStores);
    }
    if (whereClause.user) {
      neededStores.add("User");
      this.client.user._getNeededStoresForWhere(whereClause.user, neededStores);
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.FatherDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Father");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
      const orderBy_children = orderBy.find((clause) => clause.children);
      if (orderBy_children) {
        neededStores.add("Child");
      }
      const orderBy_wife = orderBy.find((clause) => clause.wife);
      if (orderBy_wife) {
        this.client.mother
          ._getNeededStoresForFind({ orderBy: orderBy_wife.wife })
          .forEach((storeName) => neededStores.add(storeName));
      }
      const orderBy_user = orderBy.find((clause) => clause.user);
      if (orderBy_user) {
        this.client.user
          ._getNeededStoresForFind({ orderBy: orderBy_user.user })
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.children || query?.include?.children) {
      neededStores.add("Child");
      if (typeof query.select?.children === "object") {
        this.client.child
          ._getNeededStoresForFind(query.select.children)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.children === "object") {
        this.client.child
          ._getNeededStoresForFind(query.include.children)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.wife || query?.include?.wife) {
      neededStores.add("Mother");
      if (typeof query.select?.wife === "object") {
        this.client.mother
          ._getNeededStoresForFind(query.select.wife)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.wife === "object") {
        this.client.mother
          ._getNeededStoresForFind(query.include.wife)
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
  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.FatherDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Father");
    if (data?.children) {
      neededStores.add("Child");
      if (data.children.create) {
        const createData = Array.isArray(data.children.create) ? data.children.create : [data.children.create];
        createData.forEach((record) =>
          this.client.child._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.children.connectOrCreate) {
        IDBUtils.convertToArray(data.children.connectOrCreate).forEach((record) =>
          this.client.child
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.children.createMany) {
        IDBUtils.convertToArray(data.children.createMany.data).forEach((record) =>
          this.client.child._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data?.wife) {
      neededStores.add("Mother");
      if (data.wife.create) {
        const createData = Array.isArray(data.wife.create) ? data.wife.create : [data.wife.create];
        createData.forEach((record) =>
          this.client.mother._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.wife.connectOrCreate) {
        IDBUtils.convertToArray(data.wife.connectOrCreate).forEach((record) =>
          this.client.mother
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data?.motherFirstName !== undefined) {
      neededStores.add("Mother");
    }
    if (data?.user) {
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
    if (data?.userId !== undefined) {
      neededStores.add("User");
    }
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.FatherDelegate, "update">>(
    query: Partial<Q>,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.FatherDelegate, "create">["data"]),
    );
    if (query.data?.children?.connect) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.children.connect).forEach((connect) => {
        this.client.child._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.children?.set) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.children.set).forEach((setWhere) => {
        this.client.child._getNeededStoresForWhere(setWhere, neededStores);
      });
    }
    if (query.data?.children?.updateMany) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.children.updateMany).forEach((update) => {
        this.client.child
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.ChildDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.children?.update) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.children.update).forEach((update) => {
        this.client.child
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.ChildDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.children?.upsert) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.children.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.ChildDelegate,
          "update"
        >;
        this.client.child._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.wife?.connect) {
      neededStores.add("Mother");
      IDBUtils.convertToArray(query.data.wife.connect).forEach((connect) => {
        this.client.mother._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.wife?.update) {
      neededStores.add("Mother");
      IDBUtils.convertToArray(query.data.wife.update).forEach((update) => {
        this.client.mother
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.MotherDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.wife?.upsert) {
      neededStores.add("Mother");
      IDBUtils.convertToArray(query.data.wife.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.MotherDelegate,
          "update"
        >;
        this.client.mother._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.user?.connect) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.connect).forEach((connect) => {
        this.client.user._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.user?.disconnect) {
      neededStores.add("User");
      if (query.data?.user?.disconnect !== true) {
        IDBUtils.convertToArray(query.data.user.disconnect).forEach((disconnect) => {
          this.client.user._getNeededStoresForWhere(disconnect, neededStores);
        });
      }
    }
    if (query.data?.user?.update) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.update).forEach((update) => {
        this.client.user
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.UserDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.user?.upsert) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.UserDelegate,
          "update"
        >;
        this.client.user._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.children?.delete || query.data?.children?.deleteMany) {
      this.client.child._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.user?.delete) {
      this.client.user._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.firstName !== undefined || query.data?.lastName !== undefined) {
      neededStores.add("Child");
    }
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("Father");
    this.client.child._getNeededStoresForNestedDelete(neededStores);
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.FatherDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.FatherDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate?.children;
    delete recordWithoutNestedCreate?.wife;
    delete recordWithoutNestedCreate?.user;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.FatherDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.FatherDelegate, object, "findMany">): void {}
  async findMany<Q extends Prisma.Args<Prisma.FatherDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("Father").getAll(), query?.where, tx);
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.FatherDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.FatherDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.FatherDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<Q extends Prisma.Args<Prisma.FatherDelegate, "findFirstOrThrow">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.FatherDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.firstName_lastName !== undefined) {
      record = await tx
        .objectStore("Father")
        .get([query.where.firstName_lastName.firstName, query.where.firstName_lastName.lastName]);
    } else if (query.where.motherFirstName_motherLastName !== undefined) {
      record = await tx
        .objectStore("Father")
        .index("motherFirstName_motherLastNameIndex")
        .get([
          query.where.motherFirstName_motherLastName.motherFirstName,
          query.where.motherFirstName_motherLastName.motherLastName,
        ]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.FatherDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.FatherDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.FatherDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Father"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.FatherDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.FatherCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.FatherDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.FatherDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    if (query.data.wife) {
      const fk: Partial<PrismaIDBSchema["Mother"]["key"]> = [];
      if (query.data.wife?.create) {
        const record = await this.client.mother.create({ data: query.data.wife.create }, { tx, silent, addToOutbox });
        fk[0] = record.firstName;
        fk[1] = record.lastName;
      }
      if (query.data.wife?.connect) {
        const record = await this.client.mother.findUniqueOrThrow({ where: query.data.wife.connect }, { tx });
        delete query.data.wife.connect;
        fk[0] = record.firstName;
        fk[1] = record.lastName;
      }
      if (query.data.wife?.connectOrCreate) {
        const record = await this.client.mother.upsert(
          {
            where: query.data.wife.connectOrCreate.where,
            create: query.data.wife.connectOrCreate.create,
            update: {},
          },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.firstName;
        fk[1] = record.lastName;
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.motherFirstName = fk[0];
      unsafeData.motherLastName = fk[1];
      delete unsafeData.wife;
    } else if (query.data?.motherFirstName !== undefined && query.data.motherFirstName !== null) {
      await this.client.mother.findUniqueOrThrow(
        {
          where: { firstName_lastName: { firstName: query.data.motherFirstName, lastName: query.data.motherLastName } },
        },
        { tx },
      );
    }
    if (query.data.user) {
      const fk: Partial<PrismaIDBSchema["User"]["key"]> = [];
      if (query.data.user?.create) {
        const record = await this.client.user.create({ data: query.data.user.create }, { tx, silent, addToOutbox });
        fk[0] = record.id;
      }
      if (query.data.user?.connect) {
        const record = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, { tx });
        delete query.data.user.connect;
        fk[0] = record.id;
      }
      if (query.data.user?.connectOrCreate) {
        const record = await this.client.user.upsert(
          {
            where: query.data.user.connectOrCreate.where,
            create: query.data.user.connectOrCreate.create,
            update: {},
          },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.id;
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.userId = fk[0];
      delete unsafeData.user;
    } else if (query.data?.userId !== undefined && query.data.userId !== null) {
      await this.client.user.findUniqueOrThrow(
        {
          where: { id: query.data.userId },
        },
        { tx },
      );
    }
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("Father").add(record);
    if (query.data?.children?.create) {
      const createData = Array.isArray(query.data.children.create)
        ? query.data.children.create
        : [query.data.children.create];
      for (const elem of createData) {
        await this.client.child.create(
          {
            data: {
              ...elem,
              father: { connect: { firstName_lastName: { firstName: keyPath[0], lastName: keyPath[1] } } },
            } as Prisma.Args<Prisma.ChildDelegate, "create">["data"],
          },
          { tx, silent, addToOutbox },
        );
      }
    }
    if (query.data?.children?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.children.connect).map(async (connectWhere) => {
          await this.client.child.update(
            { where: connectWhere, data: { fatherLastName: keyPath[1], fatherFirstName: keyPath[0] } },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.children?.connectOrCreate) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.children.connectOrCreate).map(async (connectOrCreate) => {
          await this.client.child.upsert(
            {
              where: connectOrCreate.where,
              create: {
                ...connectOrCreate.create,
                fatherLastName: keyPath[1],
                fatherFirstName: keyPath[0],
              } as NonNullable<Prisma.Args<Prisma.ChildDelegate, "create">["data"]>,
              update: { fatherLastName: keyPath[1], fatherFirstName: keyPath[0] },
            },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.children?.createMany) {
      await this.client.child.createMany(
        {
          data: IDBUtils.convertToArray(query.data.children.createMany.data).map((createData) => ({
            ...createData,
            fatherLastName: keyPath[1],
            fatherFirstName: keyPath[0],
          })),
        },
        { tx, silent, addToOutbox },
      );
    }
    const data = (await tx.objectStore("Father").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<Prisma.FatherDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.FatherDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["Father"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Father").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.FatherDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.FatherDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["Father"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Father").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<Prisma.FatherDelegate, Q, "createManyAndReturn">;
  }
  async delete<Q extends Prisma.Args<Prisma.FatherDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    const relatedChild = await this.client.child.findMany(
      { where: { fatherLastName: record.lastName, fatherFirstName: record.firstName } },
      { tx },
    );
    if (relatedChild.length) throw new Error("Cannot delete record, other records depend on it");
    await tx.objectStore("Father").delete([record.firstName, record.lastName]);
    await this.emit("delete", [record.firstName, record.lastName], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.FatherDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete(
        { where: { firstName_lastName: { firstName: record.firstName, lastName: record.lastName } } },
        { tx, silent, addToOutbox },
      );
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.FatherDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["Father"]["key"] = [record.firstName, record.lastName];
    const stringFields = ["firstName", "lastName", "motherFirstName", "motherLastName"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const intFields = ["userId"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    if (query.data.children) {
      if (query.data.children.connect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.connect).map(async (connectWhere) => {
            await this.client.child.update(
              { where: connectWhere, data: { fatherLastName: record.lastName, fatherFirstName: record.firstName } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.children.disconnect) {
        throw new Error("Cannot disconnect required relation");
      }
      if (query.data.children.create) {
        const createData = Array.isArray(query.data.children.create)
          ? query.data.children.create
          : [query.data.children.create];
        for (const elem of createData) {
          await this.client.child.create(
            {
              data: { ...elem, fatherLastName: record.lastName, fatherFirstName: record.firstName } as Prisma.Args<
                Prisma.ChildDelegate,
                "create"
              >["data"],
            },
            { tx, silent, addToOutbox },
          );
        }
      }
      if (query.data.children.createMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.createMany.data).map(async (createData) => {
            await this.client.child.create(
              { data: { ...createData, fatherLastName: record.lastName, fatherFirstName: record.firstName } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.children.update) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.update).map(async (updateData) => {
            await this.client.child.update(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.children.updateMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.updateMany).map(async (updateData) => {
            await this.client.child.updateMany(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.children.upsert) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.upsert).map(async (upsertData) => {
            await this.client.child.upsert(
              {
                ...upsertData,
                where: { ...upsertData.where, fatherLastName: record.lastName, fatherFirstName: record.firstName },
                create: {
                  ...upsertData.create,
                  fatherLastName: record.lastName,
                  fatherFirstName: record.firstName,
                } as Prisma.Args<Prisma.ChildDelegate, "upsert">["create"],
              },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.children.delete) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.delete).map(async (deleteData) => {
            await this.client.child.delete(
              { where: { ...deleteData, fatherLastName: record.lastName, fatherFirstName: record.firstName } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.children.deleteMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.deleteMany).map(async (deleteData) => {
            await this.client.child.deleteMany(
              { where: { ...deleteData, fatherLastName: record.lastName, fatherFirstName: record.firstName } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.children.set) {
        const existing = await this.client.child.findMany(
          { where: { fatherLastName: record.lastName, fatherFirstName: record.firstName } },
          { tx },
        );
        if (existing.length > 0) {
          throw new Error("Cannot set required relation");
        }
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.set).map(async (setData) => {
            await this.client.child.update(
              { where: setData, data: { fatherLastName: record.lastName, fatherFirstName: record.firstName } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
    }
    if (query.data.wife) {
      if (query.data.wife.connect) {
        const other = await this.client.mother.findUniqueOrThrow({ where: query.data.wife.connect }, { tx });
        record.motherFirstName = other.firstName;
        record.motherLastName = other.lastName;
      }
      if (query.data.wife.create) {
        const other = await this.client.mother.create({ data: query.data.wife.create }, { tx, silent, addToOutbox });
        record.motherFirstName = other.firstName;
        record.motherLastName = other.lastName;
      }
      if (query.data.wife.update) {
        const updateData = query.data.wife.update.data ?? query.data.wife.update;
        await this.client.mother.update(
          {
            where: {
              ...query.data.wife.update.where,
              firstName_lastName: { firstName: record.motherFirstName, lastName: record.motherLastName },
            } as Prisma.MotherWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.wife.upsert) {
        await this.client.mother.upsert(
          {
            where: {
              ...query.data.wife.upsert.where,
              firstName_lastName: { firstName: record.motherFirstName, lastName: record.motherLastName },
            } as Prisma.MotherWhereUniqueInput,
            create: {
              ...query.data.wife.upsert.create,
              firstName: record.motherFirstName!,
              lastName: record.motherLastName!,
            } as Prisma.Args<Prisma.MotherDelegate, "upsert">["create"],
            update: query.data.wife.upsert.update,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.wife.connectOrCreate) {
        await this.client.mother.upsert(
          {
            where: {
              ...query.data.wife.connectOrCreate.where,
              firstName_lastName: { firstName: record.motherFirstName, lastName: record.motherLastName },
            },
            create: {
              ...query.data.wife.connectOrCreate.create,
              firstName: record.motherFirstName!,
              lastName: record.motherLastName!,
            } as Prisma.Args<Prisma.MotherDelegate, "upsert">["create"],
            update: { firstName: record.motherFirstName!, lastName: record.motherLastName! },
          },
          { tx: tx, silent, addToOutbox },
        );
      }
    }
    if (query.data.user) {
      if (query.data.user.connect) {
        const other = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, { tx });
        record.userId = other.id;
      }
      if (query.data.user.create) {
        const other = await this.client.user.create({ data: query.data.user.create }, { tx, silent, addToOutbox });
        record.userId = other.id;
      }
      if (query.data.user.update) {
        const updateData = query.data.user.update.data ?? query.data.user.update;
        await this.client.user.update(
          {
            where: { ...query.data.user.update.where, id: record.userId! } as Prisma.UserWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.user.upsert) {
        await this.client.user.upsert(
          {
            where: { ...query.data.user.upsert.where, id: record.userId! } as Prisma.UserWhereUniqueInput,
            create: { ...query.data.user.upsert.create, id: record.userId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: query.data.user.upsert.update,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.user.connectOrCreate) {
        await this.client.user.upsert(
          {
            where: { ...query.data.user.connectOrCreate.where, id: record.userId! },
            create: { ...query.data.user.connectOrCreate.create, id: record.userId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: { id: record.userId! },
          },
          { tx: tx, silent, addToOutbox },
        );
      }
      if (query.data.user.disconnect) {
        record.userId = null;
      }
      if (query.data.user.delete) {
        const deleteWhere = query.data.user.delete === true ? {} : query.data.user.delete;
        await this.client.user.delete({ where: { ...deleteWhere, id: record.userId! } } as Prisma.UserDeleteArgs, {
          tx,
          silent,
          addToOutbox,
        });
        record.userId = null;
      }
    }
    if (query.data.motherFirstName !== undefined || query.data.motherLastName !== undefined) {
      const related = await this.client.mother.findUnique(
        { where: { firstName_lastName: { firstName: record.motherFirstName, lastName: record.motherLastName } } },
        { tx },
      );
      if (!related) throw new Error("Related record not found");
    }
    if (query.data.userId !== undefined && record.userId !== null) {
      const related = await this.client.user.findUnique({ where: { id: record.userId } }, { tx });
      if (!related) throw new Error("Related record not found");
    }
    const endKeyPath: PrismaIDBSchema["Father"]["key"] = [record.firstName, record.lastName];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("Father").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("Father").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("Father").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        await this.client.child.updateMany(
          {
            where: { fatherLastName: startKeyPath[1], fatherFirstName: startKeyPath[0] },
            data: { fatherLastName: endKeyPath[1], fatherFirstName: endKeyPath[0] },
          },
          { tx, silent, addToOutbox },
        );
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { firstName_lastName: { firstName: keyPath[0], lastName: keyPath[1] } },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.FatherDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.FatherDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update(
          {
            where: { firstName_lastName: { firstName: record.firstName, lastName: record.lastName } },
            data: query.data,
          },
          { tx, silent, addToOutbox },
        );
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.FatherDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<Prisma.FatherDelegate, "update">["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow(
      {
        where: { firstName_lastName: { firstName: record.firstName, lastName: record.lastName } },
        select: query.select,
        include: query.include,
      },
      { tx },
    );
    return record as Prisma.Result<Prisma.FatherDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.FatherDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.FatherDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Father"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.FatherDelegate, Q, "aggregate">> = {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<Prisma.FatherDelegate, Q, "aggregate">["_min"];
      const numericFields = ["userId"] as const;
      for (const field of numericFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as number) = Math.min(...values);
      }
      const stringFields = ["firstName", "lastName", "motherFirstName", "motherLastName"] as const;
      for (const field of stringFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as string) = values.sort()[0];
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<Prisma.FatherDelegate, Q, "aggregate">["_max"];
      const numericFields = ["userId"] as const;
      for (const field of numericFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);
      }
      const stringFields = ["firstName", "lastName", "motherFirstName", "motherLastName"] as const;
      for (const field of stringFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
      }
      result._max = maxResult;
    }
    if (query?._avg) {
      const avgResult = {} as Prisma.Result<Prisma.FatherDelegate, Q, "aggregate">["_avg"];
      for (const untypedField of Object.keys(query._avg)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;
      }
      result._avg = avgResult;
    }
    if (query?._sum) {
      const sumResult = {} as Prisma.Result<Prisma.FatherDelegate, Q, "aggregate">["_sum"];
      for (const untypedField of Object.keys(query._sum)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);
      }
      result._sum = sumResult;
    }
    return result as unknown as Prisma.Result<Prisma.FatherDelegate, Q, "aggregate">;
  }
}
class MotherIDBClass extends BaseIDBModelClass<"Mother"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "Mother");
  }

  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.MotherDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.MotherDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.MotherDelegate, R, W>(
      records,
      whereClause,
      tx,
      this.keyPath,
      this._applyWhereClause.bind(this),
    );
    return (
      await Promise.all(
        records.map(async (record) => {
          const stringFields = ["firstName", "lastName"] as const;
          for (const field of stringFields) {
            if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;
          }
          const numberFields = ["userId"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          if (whereClause.children) {
            if (whereClause.children.every) {
              const violatingRecord = await this.client.child.findFirst(
                {
                  where: {
                    NOT: { ...whereClause.children.every },
                    motherFirstName: record.firstName,
                    motherLastName: record.lastName,
                  },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
            if (whereClause.children.some) {
              const relatedRecords = await this.client.child.findMany(
                {
                  where: {
                    ...whereClause.children.some,
                    motherFirstName: record.firstName,
                    motherLastName: record.lastName,
                  },
                },
                { tx },
              );
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.children.none) {
              const violatingRecord = await this.client.child.findFirst(
                {
                  where: {
                    ...whereClause.children.none,
                    motherFirstName: record.firstName,
                    motherLastName: record.lastName,
                  },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
          }
          if (whereClause.husband === null) {
            const relatedRecord = await this.client.father.findFirst(
              {
                where: { motherFirstName: record.firstName, motherLastName: record.lastName },
              },
              { tx },
            );
            if (relatedRecord) return null;
          }
          if (whereClause.husband) {
            const { is, isNot, ...rest } = whereClause.husband;
            if (is === null) {
              const relatedRecord = await this.client.father.findFirst(
                { where: { motherFirstName: record.firstName, motherLastName: record.lastName } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (is !== null && is !== undefined) {
              const relatedRecord = await this.client.father.findFirst(
                { where: { ...is, motherFirstName: record.firstName, motherLastName: record.lastName } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
            if (isNot === null) {
              const relatedRecord = await this.client.father.findFirst(
                { where: { motherFirstName: record.firstName, motherLastName: record.lastName } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.father.findFirst(
                { where: { ...isNot, motherFirstName: record.firstName, motherLastName: record.lastName } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              if (record.firstName === null) return null;
              const relatedRecord = await this.client.father.findFirst(
                {
                  where: { ...whereClause.husband, motherFirstName: record.firstName, motherLastName: record.lastName },
                },
                { tx },
              );
              if (!relatedRecord) return null;
            }
          }
          if (whereClause.user === null) {
            if (record.userId !== null) return null;
          }
          if (whereClause.user) {
            const { is, isNot, ...rest } = whereClause.user;
            if (is === null) {
              if (record.userId !== null) return null;
            }
            if (is !== null && is !== undefined) {
              if (record.userId === null) return null;
              const relatedRecord = await this.client.user.findFirst({ where: { ...is, id: record.userId } }, { tx });
              if (!relatedRecord) return null;
            }
            if (isNot === null) {
              if (record.userId === null) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              if (record.userId === null) return null;
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...isNot, id: record.userId } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              if (record.userId === null) return null;
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...whereClause.user, id: record.userId } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
  }
  private _applySelectClause<S extends Prisma.Args<Prisma.MotherDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.MotherDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.MotherDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.MotherDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of ["firstName", "lastName", "children", "husband", "user", "userId"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.MotherDelegate, { select: S }, "findFirstOrThrow">[];
  }
  private async _applyRelations<Q extends Prisma.Args<Prisma.MotherDelegate, "findMany">>(
    records: Prisma.Result<Prisma.MotherDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.TransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.MotherDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_children = query.select?.children || query.include?.children;
      if (attach_children) {
        unsafeRecord["children"] = await this.client.child.findMany(
          {
            ...(attach_children === true ? {} : attach_children),
            where: { motherFirstName: record.firstName!, motherLastName: record.lastName! },
          },
          { tx },
        );
      }
      const attach_husband = query.select?.husband || query.include?.husband;
      if (attach_husband) {
        unsafeRecord["husband"] = await this.client.father.findUnique(
          {
            ...(attach_husband === true ? {} : attach_husband),
            where: {
              motherFirstName_motherLastName: { motherFirstName: record.firstName, motherLastName: record.lastName },
            },
          },
          { tx },
        );
      }
      const attach_user = query.select?.user || query.include?.user;
      if (attach_user) {
        unsafeRecord["user"] =
          record.userId === null
            ? null
            : await this.client.user.findUnique(
                {
                  ...(attach_user === true ? {} : attach_user),
                  where: { id: record.userId! },
                },
                { tx },
              );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.MotherDelegate, Q, "findFirstOrThrow">[];
  }
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.MotherDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.MotherDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.MotherDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.MotherOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = ["firstName", "lastName", "userId"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
    if (orderByInput.husband) {
      return record.firstName === null
        ? null
        : await this.client.father._resolveOrderByKey(
            await this.client.father.findFirstOrThrow({ where: { motherFirstName: record.firstName } }),
            orderByInput.husband,
            tx,
          );
    }
    if (orderByInput.user) {
      return record.userId === null
        ? null
        : await this.client.user._resolveOrderByKey(
            await this.client.user.findFirstOrThrow({ where: { id: record.userId } }),
            orderByInput.user,
            tx,
          );
    }
    if (orderByInput.children) {
      return await this.client.child.count(
        { where: { motherFirstName: record.firstName, motherLastName: record.lastName } },
        { tx },
      );
    }
  }
  _resolveSortOrder(
    orderByInput: Prisma.MotherOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = ["firstName", "lastName", "userId"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    if (orderByInput.husband) {
      return this.client.father._resolveSortOrder(orderByInput.husband);
    }
    if (orderByInput.user) {
      return this.client.user._resolveSortOrder(orderByInput.user);
    }
    if (orderByInput.children?._count) {
      return orderByInput.children._count;
    }
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.MotherDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.userId === undefined) {
      data.userId = null;
    }
    return data;
  }
  _getNeededStoresForWhere<W extends Prisma.Args<Prisma.MotherDelegate, "findMany">["where"]>(
    whereClause: W,
    neededStores: Set<StoreNames<PrismaIDBSchema>>,
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
    if (whereClause.children) {
      neededStores.add("Child");
      this.client.child._getNeededStoresForWhere(whereClause.children.every, neededStores);
      this.client.child._getNeededStoresForWhere(whereClause.children.some, neededStores);
      this.client.child._getNeededStoresForWhere(whereClause.children.none, neededStores);
    }
    if (whereClause.husband) {
      neededStores.add("Father");
      this.client.father._getNeededStoresForWhere(whereClause.husband, neededStores);
    }
    if (whereClause.user) {
      neededStores.add("User");
      this.client.user._getNeededStoresForWhere(whereClause.user, neededStores);
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.MotherDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Mother");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
      const orderBy_children = orderBy.find((clause) => clause.children);
      if (orderBy_children) {
        neededStores.add("Child");
      }
      const orderBy_husband = orderBy.find((clause) => clause.husband);
      if (orderBy_husband) {
        this.client.father
          ._getNeededStoresForFind({ orderBy: orderBy_husband.husband })
          .forEach((storeName) => neededStores.add(storeName));
      }
      const orderBy_user = orderBy.find((clause) => clause.user);
      if (orderBy_user) {
        this.client.user
          ._getNeededStoresForFind({ orderBy: orderBy_user.user })
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.children || query?.include?.children) {
      neededStores.add("Child");
      if (typeof query.select?.children === "object") {
        this.client.child
          ._getNeededStoresForFind(query.select.children)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.children === "object") {
        this.client.child
          ._getNeededStoresForFind(query.include.children)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.husband || query?.include?.husband) {
      neededStores.add("Father");
      if (typeof query.select?.husband === "object") {
        this.client.father
          ._getNeededStoresForFind(query.select.husband)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.husband === "object") {
        this.client.father
          ._getNeededStoresForFind(query.include.husband)
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
  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.MotherDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Mother");
    if (data?.children) {
      neededStores.add("Child");
      if (data.children.create) {
        const createData = Array.isArray(data.children.create) ? data.children.create : [data.children.create];
        createData.forEach((record) =>
          this.client.child._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.children.connectOrCreate) {
        IDBUtils.convertToArray(data.children.connectOrCreate).forEach((record) =>
          this.client.child
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.children.createMany) {
        IDBUtils.convertToArray(data.children.createMany.data).forEach((record) =>
          this.client.child._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data?.husband) {
      neededStores.add("Father");
      if (data.husband.create) {
        const createData = Array.isArray(data.husband.create) ? data.husband.create : [data.husband.create];
        createData.forEach((record) =>
          this.client.father._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.husband.connectOrCreate) {
        IDBUtils.convertToArray(data.husband.connectOrCreate).forEach((record) =>
          this.client.father
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data?.user) {
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
    if (data?.userId !== undefined) {
      neededStores.add("User");
    }
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.MotherDelegate, "update">>(
    query: Partial<Q>,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.MotherDelegate, "create">["data"]),
    );
    if (query.data?.children?.connect) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.children.connect).forEach((connect) => {
        this.client.child._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.children?.set) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.children.set).forEach((setWhere) => {
        this.client.child._getNeededStoresForWhere(setWhere, neededStores);
      });
    }
    if (query.data?.children?.updateMany) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.children.updateMany).forEach((update) => {
        this.client.child
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.ChildDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.children?.update) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.children.update).forEach((update) => {
        this.client.child
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.ChildDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.children?.upsert) {
      neededStores.add("Child");
      IDBUtils.convertToArray(query.data.children.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.ChildDelegate,
          "update"
        >;
        this.client.child._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.husband?.connect) {
      neededStores.add("Father");
      IDBUtils.convertToArray(query.data.husband.connect).forEach((connect) => {
        this.client.father._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.husband?.disconnect) {
      neededStores.add("Father");
      if (query.data?.husband?.disconnect !== true) {
        IDBUtils.convertToArray(query.data.husband.disconnect).forEach((disconnect) => {
          this.client.father._getNeededStoresForWhere(disconnect, neededStores);
        });
      }
    }
    if (query.data?.husband?.update) {
      neededStores.add("Father");
      IDBUtils.convertToArray(query.data.husband.update).forEach((update) => {
        this.client.father
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.FatherDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.husband?.upsert) {
      neededStores.add("Father");
      IDBUtils.convertToArray(query.data.husband.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.FatherDelegate,
          "update"
        >;
        this.client.father._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.user?.connect) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.connect).forEach((connect) => {
        this.client.user._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.user?.disconnect) {
      neededStores.add("User");
      if (query.data?.user?.disconnect !== true) {
        IDBUtils.convertToArray(query.data.user.disconnect).forEach((disconnect) => {
          this.client.user._getNeededStoresForWhere(disconnect, neededStores);
        });
      }
    }
    if (query.data?.user?.update) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.update).forEach((update) => {
        this.client.user
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.UserDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.user?.upsert) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.UserDelegate,
          "update"
        >;
        this.client.user._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.children?.delete || query.data?.children?.deleteMany) {
      this.client.child._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.husband?.delete) {
      this.client.father._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.user?.delete) {
      this.client.user._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.firstName !== undefined || query.data?.lastName !== undefined) {
      neededStores.add("Father");
      neededStores.add("Child");
    }
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("Mother");
    this.client.child._getNeededStoresForNestedDelete(neededStores);
    this.client.father._getNeededStoresForNestedDelete(neededStores);
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.MotherDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.MotherDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate?.children;
    delete recordWithoutNestedCreate?.husband;
    delete recordWithoutNestedCreate?.user;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.MotherDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.MotherDelegate, object, "findMany">): void {}
  async findMany<Q extends Prisma.Args<Prisma.MotherDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("Mother").getAll(), query?.where, tx);
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.MotherDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.MotherDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.MotherDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<Q extends Prisma.Args<Prisma.MotherDelegate, "findFirstOrThrow">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.MotherDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.firstName_lastName !== undefined) {
      record = await tx
        .objectStore("Mother")
        .get([query.where.firstName_lastName.firstName, query.where.firstName_lastName.lastName]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.MotherDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.MotherDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.MotherDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Mother"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.MotherDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.MotherCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.MotherDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.MotherDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    if (query.data.user) {
      const fk: Partial<PrismaIDBSchema["User"]["key"]> = [];
      if (query.data.user?.create) {
        const record = await this.client.user.create({ data: query.data.user.create }, { tx, silent, addToOutbox });
        fk[0] = record.id;
      }
      if (query.data.user?.connect) {
        const record = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, { tx });
        delete query.data.user.connect;
        fk[0] = record.id;
      }
      if (query.data.user?.connectOrCreate) {
        const record = await this.client.user.upsert(
          {
            where: query.data.user.connectOrCreate.where,
            create: query.data.user.connectOrCreate.create,
            update: {},
          },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.id;
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.userId = fk[0];
      delete unsafeData.user;
    } else if (query.data?.userId !== undefined && query.data.userId !== null) {
      await this.client.user.findUniqueOrThrow(
        {
          where: { id: query.data.userId },
        },
        { tx },
      );
    }
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("Mother").add(record);
    if (query.data.husband?.create) {
      await this.client.father.create(
        {
          data: {
            ...query.data.husband.create,
            motherFirstName: keyPath[0],
            motherLastName: keyPath[1],
          } as Prisma.Args<Prisma.FatherDelegate, "create">["data"],
        },
        { tx, silent, addToOutbox },
      );
    }
    if (query.data.husband?.connect) {
      await this.client.father.update(
        { where: query.data.husband.connect, data: { motherFirstName: keyPath[0], motherLastName: keyPath[1] } },
        { tx, silent, addToOutbox },
      );
    }
    if (query.data.husband?.connectOrCreate) {
      await this.client.father.upsert(
        {
          where: query.data.husband.connectOrCreate.where,
          create: {
            ...query.data.husband.connectOrCreate.create,
            motherFirstName: keyPath[0],
            motherLastName: keyPath[1],
          } as Prisma.Args<Prisma.FatherDelegate, "create">["data"],
          update: { motherFirstName: keyPath[0], motherLastName: keyPath[1] },
        },
        { tx, silent, addToOutbox },
      );
    }
    if (query.data?.children?.create) {
      const createData = Array.isArray(query.data.children.create)
        ? query.data.children.create
        : [query.data.children.create];
      for (const elem of createData) {
        await this.client.child.create(
          {
            data: {
              ...elem,
              mother: { connect: { firstName_lastName: { firstName: keyPath[0], lastName: keyPath[1] } } },
            } as Prisma.Args<Prisma.ChildDelegate, "create">["data"],
          },
          { tx, silent, addToOutbox },
        );
      }
    }
    if (query.data?.children?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.children.connect).map(async (connectWhere) => {
          await this.client.child.update(
            { where: connectWhere, data: { motherFirstName: keyPath[0], motherLastName: keyPath[1] } },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.children?.connectOrCreate) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.children.connectOrCreate).map(async (connectOrCreate) => {
          await this.client.child.upsert(
            {
              where: connectOrCreate.where,
              create: {
                ...connectOrCreate.create,
                motherFirstName: keyPath[0],
                motherLastName: keyPath[1],
              } as NonNullable<Prisma.Args<Prisma.ChildDelegate, "create">["data"]>,
              update: { motherFirstName: keyPath[0], motherLastName: keyPath[1] },
            },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.children?.createMany) {
      await this.client.child.createMany(
        {
          data: IDBUtils.convertToArray(query.data.children.createMany.data).map((createData) => ({
            ...createData,
            motherFirstName: keyPath[0],
            motherLastName: keyPath[1],
          })),
        },
        { tx, silent, addToOutbox },
      );
    }
    const data = (await tx.objectStore("Mother").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<Prisma.MotherDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.MotherDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["Mother"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Mother").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.MotherDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.MotherDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["Mother"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Mother").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<Prisma.MotherDelegate, Q, "createManyAndReturn">;
  }
  async delete<Q extends Prisma.Args<Prisma.MotherDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    const relatedFather = await this.client.father.findMany(
      { where: { motherFirstName: record.firstName, motherLastName: record.lastName } },
      { tx },
    );
    if (relatedFather.length) throw new Error("Cannot delete record, other records depend on it");
    const relatedChild = await this.client.child.findMany(
      { where: { motherFirstName: record.firstName, motherLastName: record.lastName } },
      { tx },
    );
    if (relatedChild.length) throw new Error("Cannot delete record, other records depend on it");
    await tx.objectStore("Mother").delete([record.firstName, record.lastName]);
    await this.emit("delete", [record.firstName, record.lastName], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.MotherDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete(
        { where: { firstName_lastName: { firstName: record.firstName, lastName: record.lastName } } },
        { tx, silent, addToOutbox },
      );
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.MotherDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["Mother"]["key"] = [record.firstName, record.lastName];
    const stringFields = ["firstName", "lastName"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const intFields = ["userId"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    if (query.data.children) {
      if (query.data.children.connect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.connect).map(async (connectWhere) => {
            await this.client.child.update(
              { where: connectWhere, data: { motherFirstName: record.firstName, motherLastName: record.lastName } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.children.disconnect) {
        throw new Error("Cannot disconnect required relation");
      }
      if (query.data.children.create) {
        const createData = Array.isArray(query.data.children.create)
          ? query.data.children.create
          : [query.data.children.create];
        for (const elem of createData) {
          await this.client.child.create(
            {
              data: { ...elem, motherFirstName: record.firstName, motherLastName: record.lastName } as Prisma.Args<
                Prisma.ChildDelegate,
                "create"
              >["data"],
            },
            { tx, silent, addToOutbox },
          );
        }
      }
      if (query.data.children.createMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.createMany.data).map(async (createData) => {
            await this.client.child.create(
              { data: { ...createData, motherFirstName: record.firstName, motherLastName: record.lastName } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.children.update) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.update).map(async (updateData) => {
            await this.client.child.update(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.children.updateMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.updateMany).map(async (updateData) => {
            await this.client.child.updateMany(updateData, { tx, silent, addToOutbox });
          }),
        );
      }
      if (query.data.children.upsert) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.upsert).map(async (upsertData) => {
            await this.client.child.upsert(
              {
                ...upsertData,
                where: { ...upsertData.where, motherFirstName: record.firstName, motherLastName: record.lastName },
                create: {
                  ...upsertData.create,
                  motherFirstName: record.firstName,
                  motherLastName: record.lastName,
                } as Prisma.Args<Prisma.ChildDelegate, "upsert">["create"],
              },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.children.delete) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.delete).map(async (deleteData) => {
            await this.client.child.delete(
              { where: { ...deleteData, motherFirstName: record.firstName, motherLastName: record.lastName } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.children.deleteMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.deleteMany).map(async (deleteData) => {
            await this.client.child.deleteMany(
              { where: { ...deleteData, motherFirstName: record.firstName, motherLastName: record.lastName } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.children.set) {
        const existing = await this.client.child.findMany(
          { where: { motherFirstName: record.firstName, motherLastName: record.lastName } },
          { tx },
        );
        if (existing.length > 0) {
          throw new Error("Cannot set required relation");
        }
        await Promise.all(
          IDBUtils.convertToArray(query.data.children.set).map(async (setData) => {
            await this.client.child.update(
              { where: setData, data: { motherFirstName: record.firstName, motherLastName: record.lastName } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
    }
    if (query.data.husband) {
      if (query.data.husband.connect) {
        await this.client.father.update(
          {
            where: query.data.husband.connect,
            data: { motherFirstName: record.firstName, motherLastName: record.lastName },
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.husband.disconnect) {
        throw new Error("Cannot disconnect required relation");
      }
      if (query.data.husband.create) {
        await this.client.father.create(
          {
            data: {
              ...query.data.husband.create,
              motherFirstName: record.firstName,
              motherLastName: record.lastName,
            } as Prisma.Args<Prisma.FatherDelegate, "create">["data"],
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.husband.delete) {
        const deleteWhere = query.data.husband.delete === true ? {} : query.data.husband.delete;
        await this.client.father.delete(
          {
            where: {
              ...deleteWhere,
              motherFirstName: record.firstName,
              motherLastName: record.lastName,
            } as Prisma.FatherWhereUniqueInput,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.husband.update) {
        const updateData = query.data.husband.update.data ?? query.data.husband.update;
        await this.client.father.update(
          {
            where: {
              ...query.data.husband.update.where,
              motherFirstName: record.firstName,
              motherLastName: record.lastName,
            } as Prisma.FatherWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.husband.upsert) {
        await this.client.father.upsert(
          {
            ...query.data.husband.upsert,
            where: {
              ...query.data.husband.upsert.where,
              motherFirstName: record.firstName,
              motherLastName: record.lastName,
            } as Prisma.FatherWhereUniqueInput,
            create: {
              ...query.data.husband.upsert.create,
              motherFirstName: record.firstName,
              motherLastName: record.lastName,
            } as Prisma.Args<Prisma.FatherDelegate, "upsert">["create"],
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.husband.connectOrCreate) {
        await this.client.father.upsert(
          {
            where: {
              ...query.data.husband.connectOrCreate.where,
              motherFirstName: record.firstName,
              motherLastName: record.lastName,
            } as Prisma.FatherWhereUniqueInput,
            create: {
              ...query.data.husband.connectOrCreate.create,
              motherFirstName: record.firstName,
              motherLastName: record.lastName,
            } as Prisma.Args<Prisma.FatherDelegate, "upsert">["create"],
            update: { motherFirstName: record.firstName, motherLastName: record.lastName },
          },
          { tx, silent, addToOutbox },
        );
      }
    }
    if (query.data.user) {
      if (query.data.user.connect) {
        const other = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, { tx });
        record.userId = other.id;
      }
      if (query.data.user.create) {
        const other = await this.client.user.create({ data: query.data.user.create }, { tx, silent, addToOutbox });
        record.userId = other.id;
      }
      if (query.data.user.update) {
        const updateData = query.data.user.update.data ?? query.data.user.update;
        await this.client.user.update(
          {
            where: { ...query.data.user.update.where, id: record.userId! } as Prisma.UserWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.user.upsert) {
        await this.client.user.upsert(
          {
            where: { ...query.data.user.upsert.where, id: record.userId! } as Prisma.UserWhereUniqueInput,
            create: { ...query.data.user.upsert.create, id: record.userId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: query.data.user.upsert.update,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.user.connectOrCreate) {
        await this.client.user.upsert(
          {
            where: { ...query.data.user.connectOrCreate.where, id: record.userId! },
            create: { ...query.data.user.connectOrCreate.create, id: record.userId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: { id: record.userId! },
          },
          { tx: tx, silent, addToOutbox },
        );
      }
      if (query.data.user.disconnect) {
        record.userId = null;
      }
      if (query.data.user.delete) {
        const deleteWhere = query.data.user.delete === true ? {} : query.data.user.delete;
        await this.client.user.delete({ where: { ...deleteWhere, id: record.userId! } } as Prisma.UserDeleteArgs, {
          tx,
          silent,
          addToOutbox,
        });
        record.userId = null;
      }
    }
    if (query.data.userId !== undefined && record.userId !== null) {
      const related = await this.client.user.findUnique({ where: { id: record.userId } }, { tx });
      if (!related) throw new Error("Related record not found");
    }
    const endKeyPath: PrismaIDBSchema["Mother"]["key"] = [record.firstName, record.lastName];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("Mother").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("Mother").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("Mother").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        await this.client.father.updateMany(
          {
            where: { motherFirstName: startKeyPath[0], motherLastName: startKeyPath[1] },
            data: { motherFirstName: endKeyPath[0], motherLastName: endKeyPath[1] },
          },
          { tx, silent, addToOutbox },
        );
        await this.client.child.updateMany(
          {
            where: { motherFirstName: startKeyPath[0], motherLastName: startKeyPath[1] },
            data: { motherFirstName: endKeyPath[0], motherLastName: endKeyPath[1] },
          },
          { tx, silent, addToOutbox },
        );
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { firstName_lastName: { firstName: keyPath[0], lastName: keyPath[1] } },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.MotherDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.MotherDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update(
          {
            where: { firstName_lastName: { firstName: record.firstName, lastName: record.lastName } },
            data: query.data,
          },
          { tx, silent, addToOutbox },
        );
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.MotherDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<Prisma.MotherDelegate, "update">["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow(
      {
        where: { firstName_lastName: { firstName: record.firstName, lastName: record.lastName } },
        select: query.select,
        include: query.include,
      },
      { tx },
    );
    return record as Prisma.Result<Prisma.MotherDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.MotherDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.MotherDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Mother"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.MotherDelegate, Q, "aggregate">> = {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<Prisma.MotherDelegate, Q, "aggregate">["_min"];
      const numericFields = ["userId"] as const;
      for (const field of numericFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as number) = Math.min(...values);
      }
      const stringFields = ["firstName", "lastName"] as const;
      for (const field of stringFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as string) = values.sort()[0];
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<Prisma.MotherDelegate, Q, "aggregate">["_max"];
      const numericFields = ["userId"] as const;
      for (const field of numericFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);
      }
      const stringFields = ["firstName", "lastName"] as const;
      for (const field of stringFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
      }
      result._max = maxResult;
    }
    if (query?._avg) {
      const avgResult = {} as Prisma.Result<Prisma.MotherDelegate, Q, "aggregate">["_avg"];
      for (const untypedField of Object.keys(query._avg)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;
      }
      result._avg = avgResult;
    }
    if (query?._sum) {
      const sumResult = {} as Prisma.Result<Prisma.MotherDelegate, Q, "aggregate">["_sum"];
      for (const untypedField of Object.keys(query._sum)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);
      }
      result._sum = sumResult;
    }
    return result as unknown as Prisma.Result<Prisma.MotherDelegate, Q, "aggregate">;
  }
}
class ChildIDBClass extends BaseIDBModelClass<"Child"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "Child");
  }

  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.ChildDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.ChildDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.ChildDelegate, R, W>(
      records,
      whereClause,
      tx,
      this.keyPath,
      this._applyWhereClause.bind(this),
    );
    return (
      await Promise.all(
        records.map(async (record) => {
          const stringFields = [
            "childFirstName",
            "childLastName",
            "fatherFirstName",
            "fatherLastName",
            "motherFirstName",
            "motherLastName",
          ] as const;
          for (const field of stringFields) {
            if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;
          }
          const numberFields = ["userId"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          if (whereClause.user === null) {
            if (record.userId !== null) return null;
          }
          if (whereClause.user) {
            const { is, isNot, ...rest } = whereClause.user;
            if (is === null) {
              if (record.userId !== null) return null;
            }
            if (is !== null && is !== undefined) {
              if (record.userId === null) return null;
              const relatedRecord = await this.client.user.findFirst({ where: { ...is, id: record.userId } }, { tx });
              if (!relatedRecord) return null;
            }
            if (isNot === null) {
              if (record.userId === null) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              if (record.userId === null) return null;
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...isNot, id: record.userId } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              if (record.userId === null) return null;
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...whereClause.user, id: record.userId } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
          }
          if (whereClause.father) {
            const { is, isNot, ...rest } = whereClause.father;
            if (is !== null && is !== undefined) {
              const relatedRecord = await this.client.father.findFirst(
                { where: { ...is, lastName: record.fatherLastName, firstName: record.fatherFirstName } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.father.findFirst(
                { where: { ...isNot, lastName: record.fatherLastName, firstName: record.fatherFirstName } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              const relatedRecord = await this.client.father.findFirst(
                {
                  where: { ...whereClause.father, lastName: record.fatherLastName, firstName: record.fatherFirstName },
                },
                { tx },
              );
              if (!relatedRecord) return null;
            }
          }
          if (whereClause.mother) {
            const { is, isNot, ...rest } = whereClause.mother;
            if (is !== null && is !== undefined) {
              const relatedRecord = await this.client.mother.findFirst(
                { where: { ...is, firstName: record.motherFirstName, lastName: record.motherLastName } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.mother.findFirst(
                { where: { ...isNot, firstName: record.motherFirstName, lastName: record.motherLastName } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              const relatedRecord = await this.client.mother.findFirst(
                {
                  where: { ...whereClause.mother, firstName: record.motherFirstName, lastName: record.motherLastName },
                },
                { tx },
              );
              if (!relatedRecord) return null;
            }
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
  }
  private _applySelectClause<S extends Prisma.Args<Prisma.ChildDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.ChildDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.ChildDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.ChildDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of [
        "childFirstName",
        "childLastName",
        "fatherFirstName",
        "fatherLastName",
        "motherFirstName",
        "motherLastName",
        "user",
        "father",
        "mother",
        "userId",
      ]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.ChildDelegate, { select: S }, "findFirstOrThrow">[];
  }
  private async _applyRelations<Q extends Prisma.Args<Prisma.ChildDelegate, "findMany">>(
    records: Prisma.Result<Prisma.ChildDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.TransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.ChildDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_user = query.select?.user || query.include?.user;
      if (attach_user) {
        unsafeRecord["user"] =
          record.userId === null
            ? null
            : await this.client.user.findUnique(
                {
                  ...(attach_user === true ? {} : attach_user),
                  where: { id: record.userId! },
                },
                { tx },
              );
      }
      const attach_father = query.select?.father || query.include?.father;
      if (attach_father) {
        unsafeRecord["father"] = await this.client.father.findUnique(
          {
            ...(attach_father === true ? {} : attach_father),
            where: { firstName_lastName: { firstName: record.fatherFirstName!, lastName: record.fatherLastName! } },
          },
          { tx },
        );
      }
      const attach_mother = query.select?.mother || query.include?.mother;
      if (attach_mother) {
        unsafeRecord["mother"] = await this.client.mother.findUnique(
          {
            ...(attach_mother === true ? {} : attach_mother),
            where: { firstName_lastName: { firstName: record.motherFirstName!, lastName: record.motherLastName! } },
          },
          { tx },
        );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.ChildDelegate, Q, "findFirstOrThrow">[];
  }
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.ChildDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.ChildDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.ChildDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.ChildOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = [
      "childFirstName",
      "childLastName",
      "fatherFirstName",
      "fatherLastName",
      "motherFirstName",
      "motherLastName",
      "userId",
    ] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
    if (orderByInput.user) {
      return record.userId === null
        ? null
        : await this.client.user._resolveOrderByKey(
            await this.client.user.findFirstOrThrow({ where: { id: record.userId } }),
            orderByInput.user,
            tx,
          );
    }
    if (orderByInput.father) {
      return await this.client.father._resolveOrderByKey(
        await this.client.father.findFirstOrThrow({ where: { lastName: record.fatherLastName } }),
        orderByInput.father,
        tx,
      );
    }
    if (orderByInput.mother) {
      return await this.client.mother._resolveOrderByKey(
        await this.client.mother.findFirstOrThrow({ where: { firstName: record.motherFirstName } }),
        orderByInput.mother,
        tx,
      );
    }
  }
  _resolveSortOrder(
    orderByInput: Prisma.ChildOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = [
      "childFirstName",
      "childLastName",
      "fatherFirstName",
      "fatherLastName",
      "motherFirstName",
      "motherLastName",
      "userId",
    ] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    if (orderByInput.user) {
      return this.client.user._resolveSortOrder(orderByInput.user);
    }
    if (orderByInput.father) {
      return this.client.father._resolveSortOrder(orderByInput.father);
    }
    if (orderByInput.mother) {
      return this.client.mother._resolveSortOrder(orderByInput.mother);
    }
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.ChildDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.userId === undefined) {
      data.userId = null;
    }
    return data;
  }
  _getNeededStoresForWhere<W extends Prisma.Args<Prisma.ChildDelegate, "findMany">["where"]>(
    whereClause: W,
    neededStores: Set<StoreNames<PrismaIDBSchema>>,
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
    if (whereClause.user) {
      neededStores.add("User");
      this.client.user._getNeededStoresForWhere(whereClause.user, neededStores);
    }
    if (whereClause.father) {
      neededStores.add("Father");
      this.client.father._getNeededStoresForWhere(whereClause.father, neededStores);
    }
    if (whereClause.mother) {
      neededStores.add("Mother");
      this.client.mother._getNeededStoresForWhere(whereClause.mother, neededStores);
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.ChildDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Child");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
      const orderBy_user = orderBy.find((clause) => clause.user);
      if (orderBy_user) {
        this.client.user
          ._getNeededStoresForFind({ orderBy: orderBy_user.user })
          .forEach((storeName) => neededStores.add(storeName));
      }
      const orderBy_father = orderBy.find((clause) => clause.father);
      if (orderBy_father) {
        this.client.father
          ._getNeededStoresForFind({ orderBy: orderBy_father.father })
          .forEach((storeName) => neededStores.add(storeName));
      }
      const orderBy_mother = orderBy.find((clause) => clause.mother);
      if (orderBy_mother) {
        this.client.mother
          ._getNeededStoresForFind({ orderBy: orderBy_mother.mother })
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
    if (query?.select?.father || query?.include?.father) {
      neededStores.add("Father");
      if (typeof query.select?.father === "object") {
        this.client.father
          ._getNeededStoresForFind(query.select.father)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.father === "object") {
        this.client.father
          ._getNeededStoresForFind(query.include.father)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.mother || query?.include?.mother) {
      neededStores.add("Mother");
      if (typeof query.select?.mother === "object") {
        this.client.mother
          ._getNeededStoresForFind(query.select.mother)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.mother === "object") {
        this.client.mother
          ._getNeededStoresForFind(query.include.mother)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    return neededStores;
  }
  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.ChildDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Child");
    if (data?.user) {
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
    if (data?.userId !== undefined) {
      neededStores.add("User");
    }
    if (data?.father) {
      neededStores.add("Father");
      if (data.father.create) {
        const createData = Array.isArray(data.father.create) ? data.father.create : [data.father.create];
        createData.forEach((record) =>
          this.client.father._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.father.connectOrCreate) {
        IDBUtils.convertToArray(data.father.connectOrCreate).forEach((record) =>
          this.client.father
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data?.fatherLastName !== undefined) {
      neededStores.add("Father");
    }
    if (data?.mother) {
      neededStores.add("Mother");
      if (data.mother.create) {
        const createData = Array.isArray(data.mother.create) ? data.mother.create : [data.mother.create];
        createData.forEach((record) =>
          this.client.mother._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.mother.connectOrCreate) {
        IDBUtils.convertToArray(data.mother.connectOrCreate).forEach((record) =>
          this.client.mother
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data?.motherFirstName !== undefined) {
      neededStores.add("Mother");
    }
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.ChildDelegate, "update">>(
    query: Partial<Q>,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.ChildDelegate, "create">["data"]),
    );
    if (query.data?.user?.connect) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.connect).forEach((connect) => {
        this.client.user._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.user?.disconnect) {
      neededStores.add("User");
      if (query.data?.user?.disconnect !== true) {
        IDBUtils.convertToArray(query.data.user.disconnect).forEach((disconnect) => {
          this.client.user._getNeededStoresForWhere(disconnect, neededStores);
        });
      }
    }
    if (query.data?.user?.update) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.update).forEach((update) => {
        this.client.user
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.UserDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.user?.upsert) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.UserDelegate,
          "update"
        >;
        this.client.user._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.father?.connect) {
      neededStores.add("Father");
      IDBUtils.convertToArray(query.data.father.connect).forEach((connect) => {
        this.client.father._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.father?.update) {
      neededStores.add("Father");
      IDBUtils.convertToArray(query.data.father.update).forEach((update) => {
        this.client.father
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.FatherDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.father?.upsert) {
      neededStores.add("Father");
      IDBUtils.convertToArray(query.data.father.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.FatherDelegate,
          "update"
        >;
        this.client.father._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.mother?.connect) {
      neededStores.add("Mother");
      IDBUtils.convertToArray(query.data.mother.connect).forEach((connect) => {
        this.client.mother._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.mother?.update) {
      neededStores.add("Mother");
      IDBUtils.convertToArray(query.data.mother.update).forEach((update) => {
        this.client.mother
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.MotherDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.mother?.upsert) {
      neededStores.add("Mother");
      IDBUtils.convertToArray(query.data.mother.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.MotherDelegate,
          "update"
        >;
        this.client.mother._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.user?.delete) {
      this.client.user._getNeededStoresForNestedDelete(neededStores);
    }
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("Child");
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.ChildDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.ChildDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate?.user;
    delete recordWithoutNestedCreate?.father;
    delete recordWithoutNestedCreate?.mother;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.ChildDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.ChildDelegate, object, "findMany">): void {}
  async findMany<Q extends Prisma.Args<Prisma.ChildDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("Child").getAll(), query?.where, tx);
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.ChildDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.ChildDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.ChildDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<Q extends Prisma.Args<Prisma.ChildDelegate, "findFirstOrThrow">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.ChildDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.childFirstName_childLastName !== undefined) {
      record = await tx
        .objectStore("Child")
        .get([
          query.where.childFirstName_childLastName.childFirstName,
          query.where.childFirstName_childLastName.childLastName,
        ]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.ChildDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.ChildDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.ChildDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Child"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.ChildDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.ChildCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.ChildDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.ChildDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    if (query.data.user) {
      const fk: Partial<PrismaIDBSchema["User"]["key"]> = [];
      if (query.data.user?.create) {
        const record = await this.client.user.create({ data: query.data.user.create }, { tx, silent, addToOutbox });
        fk[0] = record.id;
      }
      if (query.data.user?.connect) {
        const record = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, { tx });
        delete query.data.user.connect;
        fk[0] = record.id;
      }
      if (query.data.user?.connectOrCreate) {
        const record = await this.client.user.upsert(
          {
            where: query.data.user.connectOrCreate.where,
            create: query.data.user.connectOrCreate.create,
            update: {},
          },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.id;
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.userId = fk[0];
      delete unsafeData.user;
    } else if (query.data?.userId !== undefined && query.data.userId !== null) {
      await this.client.user.findUniqueOrThrow(
        {
          where: { id: query.data.userId },
        },
        { tx },
      );
    }
    if (query.data.mother) {
      const fk: Partial<PrismaIDBSchema["Mother"]["key"]> = [];
      if (query.data.mother?.create) {
        const record = await this.client.mother.create({ data: query.data.mother.create }, { tx, silent, addToOutbox });
        fk[0] = record.firstName;
        fk[1] = record.lastName;
      }
      if (query.data.mother?.connect) {
        const record = await this.client.mother.findUniqueOrThrow({ where: query.data.mother.connect }, { tx });
        delete query.data.mother.connect;
        fk[0] = record.firstName;
        fk[1] = record.lastName;
      }
      if (query.data.mother?.connectOrCreate) {
        const record = await this.client.mother.upsert(
          {
            where: query.data.mother.connectOrCreate.where,
            create: query.data.mother.connectOrCreate.create,
            update: {},
          },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.firstName;
        fk[1] = record.lastName;
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.motherFirstName = fk[0];
      unsafeData.motherLastName = fk[1];
      delete unsafeData.mother;
    } else if (query.data?.motherFirstName !== undefined && query.data.motherFirstName !== null) {
      await this.client.mother.findUniqueOrThrow(
        {
          where: { firstName_lastName: { firstName: query.data.motherFirstName, lastName: query.data.motherLastName } },
        },
        { tx },
      );
    }
    if (query.data.father) {
      const fk: Partial<PrismaIDBSchema["Father"]["key"]> = [];
      if (query.data.father?.create) {
        const record = await this.client.father.create({ data: query.data.father.create }, { tx, silent, addToOutbox });
        fk[0] = record.firstName;
        fk[1] = record.lastName;
      }
      if (query.data.father?.connect) {
        const record = await this.client.father.findUniqueOrThrow({ where: query.data.father.connect }, { tx });
        delete query.data.father.connect;
        fk[0] = record.firstName;
        fk[1] = record.lastName;
      }
      if (query.data.father?.connectOrCreate) {
        const record = await this.client.father.upsert(
          {
            where: query.data.father.connectOrCreate.where,
            create: query.data.father.connectOrCreate.create,
            update: {},
          },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.firstName;
        fk[1] = record.lastName;
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.fatherLastName = fk[1];
      unsafeData.fatherFirstName = fk[0];
      delete unsafeData.father;
    } else if (query.data?.fatherLastName !== undefined && query.data.fatherLastName !== null) {
      await this.client.father.findUniqueOrThrow(
        {
          where: { firstName_lastName: { lastName: query.data.fatherLastName, firstName: query.data.fatherFirstName } },
        },
        { tx },
      );
    }
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("Child").add(record);
    const data = (await tx.objectStore("Child").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<Prisma.ChildDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.ChildDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["Child"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Child").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.ChildDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.ChildDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["Child"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Child").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<Prisma.ChildDelegate, Q, "createManyAndReturn">;
  }
  async delete<Q extends Prisma.Args<Prisma.ChildDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    await tx.objectStore("Child").delete([record.childFirstName, record.childLastName]);
    await this.emit("delete", [record.childFirstName, record.childLastName], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.ChildDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete(
        {
          where: {
            childFirstName_childLastName: {
              childFirstName: record.childFirstName,
              childLastName: record.childLastName,
            },
          },
        },
        { tx, silent, addToOutbox },
      );
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.ChildDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["Child"]["key"] = [record.childFirstName, record.childLastName];
    const stringFields = [
      "childFirstName",
      "childLastName",
      "fatherFirstName",
      "fatherLastName",
      "motherFirstName",
      "motherLastName",
    ] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const intFields = ["userId"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    if (query.data.user) {
      if (query.data.user.connect) {
        const other = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, { tx });
        record.userId = other.id;
      }
      if (query.data.user.create) {
        const other = await this.client.user.create({ data: query.data.user.create }, { tx, silent, addToOutbox });
        record.userId = other.id;
      }
      if (query.data.user.update) {
        const updateData = query.data.user.update.data ?? query.data.user.update;
        await this.client.user.update(
          {
            where: { ...query.data.user.update.where, id: record.userId! } as Prisma.UserWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.user.upsert) {
        await this.client.user.upsert(
          {
            where: { ...query.data.user.upsert.where, id: record.userId! } as Prisma.UserWhereUniqueInput,
            create: { ...query.data.user.upsert.create, id: record.userId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: query.data.user.upsert.update,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.user.connectOrCreate) {
        await this.client.user.upsert(
          {
            where: { ...query.data.user.connectOrCreate.where, id: record.userId! },
            create: { ...query.data.user.connectOrCreate.create, id: record.userId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: { id: record.userId! },
          },
          { tx: tx, silent, addToOutbox },
        );
      }
      if (query.data.user.disconnect) {
        record.userId = null;
      }
      if (query.data.user.delete) {
        const deleteWhere = query.data.user.delete === true ? {} : query.data.user.delete;
        await this.client.user.delete({ where: { ...deleteWhere, id: record.userId! } } as Prisma.UserDeleteArgs, {
          tx,
          silent,
          addToOutbox,
        });
        record.userId = null;
      }
    }
    if (query.data.father) {
      if (query.data.father.connect) {
        const other = await this.client.father.findUniqueOrThrow({ where: query.data.father.connect }, { tx });
        record.fatherLastName = other.lastName;
        record.fatherFirstName = other.firstName;
      }
      if (query.data.father.create) {
        const other = await this.client.father.create({ data: query.data.father.create }, { tx, silent, addToOutbox });
        record.fatherLastName = other.lastName;
        record.fatherFirstName = other.firstName;
      }
      if (query.data.father.update) {
        const updateData = query.data.father.update.data ?? query.data.father.update;
        await this.client.father.update(
          {
            where: {
              ...query.data.father.update.where,
              firstName_lastName: { lastName: record.fatherLastName, firstName: record.fatherFirstName },
            } as Prisma.FatherWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.father.upsert) {
        await this.client.father.upsert(
          {
            where: {
              ...query.data.father.upsert.where,
              firstName_lastName: { lastName: record.fatherLastName, firstName: record.fatherFirstName },
            } as Prisma.FatherWhereUniqueInput,
            create: {
              ...query.data.father.upsert.create,
              lastName: record.fatherLastName!,
              firstName: record.fatherFirstName!,
            } as Prisma.Args<Prisma.FatherDelegate, "upsert">["create"],
            update: query.data.father.upsert.update,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.father.connectOrCreate) {
        await this.client.father.upsert(
          {
            where: {
              ...query.data.father.connectOrCreate.where,
              firstName_lastName: { lastName: record.fatherLastName, firstName: record.fatherFirstName },
            },
            create: {
              ...query.data.father.connectOrCreate.create,
              lastName: record.fatherLastName!,
              firstName: record.fatherFirstName!,
            } as Prisma.Args<Prisma.FatherDelegate, "upsert">["create"],
            update: { lastName: record.fatherLastName!, firstName: record.fatherFirstName! },
          },
          { tx: tx, silent, addToOutbox },
        );
      }
    }
    if (query.data.mother) {
      if (query.data.mother.connect) {
        const other = await this.client.mother.findUniqueOrThrow({ where: query.data.mother.connect }, { tx });
        record.motherFirstName = other.firstName;
        record.motherLastName = other.lastName;
      }
      if (query.data.mother.create) {
        const other = await this.client.mother.create({ data: query.data.mother.create }, { tx, silent, addToOutbox });
        record.motherFirstName = other.firstName;
        record.motherLastName = other.lastName;
      }
      if (query.data.mother.update) {
        const updateData = query.data.mother.update.data ?? query.data.mother.update;
        await this.client.mother.update(
          {
            where: {
              ...query.data.mother.update.where,
              firstName_lastName: { firstName: record.motherFirstName, lastName: record.motherLastName },
            } as Prisma.MotherWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.mother.upsert) {
        await this.client.mother.upsert(
          {
            where: {
              ...query.data.mother.upsert.where,
              firstName_lastName: { firstName: record.motherFirstName, lastName: record.motherLastName },
            } as Prisma.MotherWhereUniqueInput,
            create: {
              ...query.data.mother.upsert.create,
              firstName: record.motherFirstName!,
              lastName: record.motherLastName!,
            } as Prisma.Args<Prisma.MotherDelegate, "upsert">["create"],
            update: query.data.mother.upsert.update,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.mother.connectOrCreate) {
        await this.client.mother.upsert(
          {
            where: {
              ...query.data.mother.connectOrCreate.where,
              firstName_lastName: { firstName: record.motherFirstName, lastName: record.motherLastName },
            },
            create: {
              ...query.data.mother.connectOrCreate.create,
              firstName: record.motherFirstName!,
              lastName: record.motherLastName!,
            } as Prisma.Args<Prisma.MotherDelegate, "upsert">["create"],
            update: { firstName: record.motherFirstName!, lastName: record.motherLastName! },
          },
          { tx: tx, silent, addToOutbox },
        );
      }
    }
    if (query.data.userId !== undefined && record.userId !== null) {
      const related = await this.client.user.findUnique({ where: { id: record.userId } }, { tx });
      if (!related) throw new Error("Related record not found");
    }
    if (query.data.fatherLastName !== undefined || query.data.fatherFirstName !== undefined) {
      const related = await this.client.father.findUnique(
        { where: { firstName_lastName: { firstName: record.fatherFirstName, lastName: record.fatherLastName } } },
        { tx },
      );
      if (!related) throw new Error("Related record not found");
    }
    if (query.data.motherFirstName !== undefined || query.data.motherLastName !== undefined) {
      const related = await this.client.mother.findUnique(
        { where: { firstName_lastName: { firstName: record.motherFirstName, lastName: record.motherLastName } } },
        { tx },
      );
      if (!related) throw new Error("Related record not found");
    }
    const endKeyPath: PrismaIDBSchema["Child"]["key"] = [record.childFirstName, record.childLastName];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("Child").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("Child").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("Child").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { childFirstName_childLastName: { childFirstName: keyPath[0], childLastName: keyPath[1] } },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.ChildDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.ChildDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update(
          {
            where: {
              childFirstName_childLastName: {
                childFirstName: record.childFirstName,
                childLastName: record.childLastName,
              },
            },
            data: query.data,
          },
          { tx, silent, addToOutbox },
        );
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.ChildDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<Prisma.ChildDelegate, "update">["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow(
      {
        where: {
          childFirstName_childLastName: { childFirstName: record.childFirstName, childLastName: record.childLastName },
        },
        select: query.select,
        include: query.include,
      },
      { tx },
    );
    return record as Prisma.Result<Prisma.ChildDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.ChildDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ChildDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Child"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.ChildDelegate, Q, "aggregate">> = {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<Prisma.ChildDelegate, Q, "aggregate">["_min"];
      const numericFields = ["userId"] as const;
      for (const field of numericFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as number) = Math.min(...values);
      }
      const stringFields = [
        "childFirstName",
        "childLastName",
        "fatherFirstName",
        "fatherLastName",
        "motherFirstName",
        "motherLastName",
      ] as const;
      for (const field of stringFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as string) = values.sort()[0];
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<Prisma.ChildDelegate, Q, "aggregate">["_max"];
      const numericFields = ["userId"] as const;
      for (const field of numericFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);
      }
      const stringFields = [
        "childFirstName",
        "childLastName",
        "fatherFirstName",
        "fatherLastName",
        "motherFirstName",
        "motherLastName",
      ] as const;
      for (const field of stringFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
      }
      result._max = maxResult;
    }
    if (query?._avg) {
      const avgResult = {} as Prisma.Result<Prisma.ChildDelegate, Q, "aggregate">["_avg"];
      for (const untypedField of Object.keys(query._avg)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;
      }
      result._avg = avgResult;
    }
    if (query?._sum) {
      const sumResult = {} as Prisma.Result<Prisma.ChildDelegate, Q, "aggregate">["_sum"];
      for (const untypedField of Object.keys(query._sum)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);
      }
      result._sum = sumResult;
    }
    return result as unknown as Prisma.Result<Prisma.ChildDelegate, Q, "aggregate">;
  }
}
class ModelWithEnumIDBClass extends BaseIDBModelClass<"ModelWithEnum"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "ModelWithEnum");
  }

  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.ModelWithEnumDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.ModelWithEnumDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.ModelWithEnumDelegate, R, W>(
      records,
      whereClause,
      tx,
      this.keyPath,
      this._applyWhereClause.bind(this),
    );
    return (
      await Promise.all(
        records.map(async (record) => {
          const numberFields = ["id"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
  }
  private _applySelectClause<S extends Prisma.Args<Prisma.ModelWithEnumDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.ModelWithEnumDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.ModelWithEnumDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.ModelWithEnumDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of ["id", "enum", "nullableEnum", "enumArray"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.ModelWithEnumDelegate, { select: S }, "findFirstOrThrow">[];
  }
  private async _applyRelations<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "findMany">>(
    records: Prisma.Result<Prisma.ModelWithEnumDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.TransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<
      Prisma.ModelWithEnumDelegate,
      Q,
      "findFirstOrThrow"
    >[];
  }
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.ModelWithEnumDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.ModelWithEnumDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.ModelWithEnumDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.ModelWithEnumOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = ["id", "enum", "nullableEnum", "enumArray"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
  }
  _resolveSortOrder(
    orderByInput: Prisma.ModelWithEnumOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = ["id", "enum", "nullableEnum", "enumArray"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.ModelWithEnumDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.id === undefined) {
      const transaction = tx ?? this.client._db.transaction(["ModelWithEnum"], "readwrite");
      const store = transaction.objectStore("ModelWithEnum");
      const cursor = await store.openCursor(null, "prev");
      data.id = cursor ? Number(cursor.key) + 1 : 1;
    }
    if (data.nullableEnum === undefined) {
      data.nullableEnum = null;
    }
    if (!Array.isArray(data.enumArray)) {
      data.enumArray = data.enumArray?.set;
    }
    return data;
  }
  _getNeededStoresForWhere<W extends Prisma.Args<Prisma.ModelWithEnumDelegate, "findMany">["where"]>(
    whereClause: W,
    neededStores: Set<StoreNames<PrismaIDBSchema>>,
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("ModelWithEnum");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
    }
    return neededStores;
  }
  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.ModelWithEnumDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("ModelWithEnum");
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "update">>(
    query: Partial<Q>,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.ModelWithEnumDelegate, "create">["data"]),
    );
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("ModelWithEnum");
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.ModelWithEnumDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.ModelWithEnumDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    return recordWithoutNestedCreate as Prisma.Result<Prisma.ModelWithEnumDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.ModelWithEnumDelegate, object, "findMany">): void {
    for (const record of records) {
      record.enumArray = record.enumArray ?? [];
    }
  }
  async findMany<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("ModelWithEnum").getAll(), query?.where, tx);
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.ModelWithEnumDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "findFirstOrThrow">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id !== undefined) {
      record = await tx.objectStore("ModelWithEnum").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["ModelWithEnum"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.ModelWithEnumCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("ModelWithEnum").add(record);
    const data = (await tx.objectStore("ModelWithEnum").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["ModelWithEnum"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("ModelWithEnum").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.ModelWithEnumDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["ModelWithEnum"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("ModelWithEnum").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "createManyAndReturn">;
  }
  async delete<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    await tx.objectStore("ModelWithEnum").delete([record.id]);
    await this.emit("delete", [record.id], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete({ where: { id: record.id } }, { tx, silent, addToOutbox });
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["ModelWithEnum"]["key"] = [record.id];
    const intFields = ["id"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    const enumFields = ["enum", "nullableEnum"] as const;
    for (const field of enumFields) {
      IDBUtils.handleEnumUpdateField(record, field, query.data[field]);
    }
    const listFields = ["enumArray"] as const;
    for (const field of listFields) {
      IDBUtils.handleScalarListUpdateField(record, field, query.data[field]);
    }
    const endKeyPath: PrismaIDBSchema["ModelWithEnum"]["key"] = [record.id];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("ModelWithEnum").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("ModelWithEnum").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("ModelWithEnum").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { id: keyPath[0] },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update({ where: { id: record.id }, data: query.data }, { tx, silent, addToOutbox });
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<Prisma.ModelWithEnumDelegate, "update">["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow({ where: { id: record.id }, select: query.select }, { tx });
    return record as Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.ModelWithEnumDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["ModelWithEnum"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "aggregate">> = {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "aggregate">["_min"];
      const numericFields = ["id"] as const;
      for (const field of numericFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as number) = Math.min(...values);
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "aggregate">["_max"];
      const numericFields = ["id"] as const;
      for (const field of numericFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);
      }
      result._max = maxResult;
    }
    if (query?._avg) {
      const avgResult = {} as Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "aggregate">["_avg"];
      for (const untypedField of Object.keys(query._avg)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;
      }
      result._avg = avgResult;
    }
    if (query?._sum) {
      const sumResult = {} as Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "aggregate">["_sum"];
      for (const untypedField of Object.keys(query._sum)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);
      }
      result._sum = sumResult;
    }
    return result as unknown as Prisma.Result<Prisma.ModelWithEnumDelegate, Q, "aggregate">;
  }
}
class TestUuidIDBClass extends BaseIDBModelClass<"TestUuid"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "TestUuid");
  }

  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.TestUuidDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.TestUuidDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.TestUuidDelegate, R, W>(
      records,
      whereClause,
      tx,
      this.keyPath,
      this._applyWhereClause.bind(this),
    );
    return (
      await Promise.all(
        records.map(async (record) => {
          const stringFields = ["id", "name"] as const;
          for (const field of stringFields) {
            if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
  }
  private _applySelectClause<S extends Prisma.Args<Prisma.TestUuidDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.TestUuidDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.TestUuidDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.TestUuidDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of ["id", "name"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.TestUuidDelegate, { select: S }, "findFirstOrThrow">[];
  }
  private async _applyRelations<Q extends Prisma.Args<Prisma.TestUuidDelegate, "findMany">>(
    records: Prisma.Result<Prisma.TestUuidDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.TransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.TestUuidDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.TestUuidDelegate, Q, "findFirstOrThrow">[];
  }
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.TestUuidDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.TestUuidDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.TestUuidDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.TestUuidOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = ["id", "name"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
  }
  _resolveSortOrder(
    orderByInput: Prisma.TestUuidOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = ["id", "name"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.TestUuidDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.id === undefined) {
      data.id = uuidv4();
    }
    return data;
  }
  _getNeededStoresForWhere<W extends Prisma.Args<Prisma.TestUuidDelegate, "findMany">["where"]>(
    whereClause: W,
    neededStores: Set<StoreNames<PrismaIDBSchema>>,
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.TestUuidDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("TestUuid");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
    }
    return neededStores;
  }
  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.TestUuidDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("TestUuid");
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.TestUuidDelegate, "update">>(
    query: Partial<Q>,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.TestUuidDelegate, "create">["data"]),
    );
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("TestUuid");
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.TestUuidDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.TestUuidDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    return recordWithoutNestedCreate as Prisma.Result<Prisma.TestUuidDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.TestUuidDelegate, object, "findMany">): void {}
  async findMany<Q extends Prisma.Args<Prisma.TestUuidDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("TestUuid").getAll(), query?.where, tx);
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.TestUuidDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.TestUuidDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.TestUuidDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<Q extends Prisma.Args<Prisma.TestUuidDelegate, "findFirstOrThrow">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.TestUuidDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id !== undefined) {
      record = await tx.objectStore("TestUuid").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.TestUuidDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.TestUuidDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.TestUuidDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["TestUuid"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.TestUuidDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.TestUuidCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.TestUuidDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.TestUuidDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("TestUuid").add(record);
    const data = (await tx.objectStore("TestUuid").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<Prisma.TestUuidDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.TestUuidDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["TestUuid"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("TestUuid").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.TestUuidDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.TestUuidDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["TestUuid"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("TestUuid").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<Prisma.TestUuidDelegate, Q, "createManyAndReturn">;
  }
  async delete<Q extends Prisma.Args<Prisma.TestUuidDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    await tx.objectStore("TestUuid").delete([record.id]);
    await this.emit("delete", [record.id], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.TestUuidDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete({ where: { id: record.id } }, { tx, silent, addToOutbox });
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.TestUuidDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["TestUuid"]["key"] = [record.id];
    const stringFields = ["id", "name"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const endKeyPath: PrismaIDBSchema["TestUuid"]["key"] = [record.id];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("TestUuid").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("TestUuid").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("TestUuid").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { id: keyPath[0] },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.TestUuidDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.TestUuidDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update({ where: { id: record.id }, data: query.data }, { tx, silent, addToOutbox });
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.TestUuidDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<Prisma.TestUuidDelegate, "update">["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow({ where: { id: record.id }, select: query.select }, { tx });
    return record as Prisma.Result<Prisma.TestUuidDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.TestUuidDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TestUuidDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["TestUuid"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.TestUuidDelegate, Q, "aggregate">> = {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<Prisma.TestUuidDelegate, Q, "aggregate">["_min"];
      const stringFields = ["id", "name"] as const;
      for (const field of stringFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as string) = values.sort()[0];
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<Prisma.TestUuidDelegate, Q, "aggregate">["_max"];
      const stringFields = ["id", "name"] as const;
      for (const field of stringFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
      }
      result._max = maxResult;
    }
    return result as unknown as Prisma.Result<Prisma.TestUuidDelegate, Q, "aggregate">;
  }
}
class ModelWithOptionalRelationToUniqueAttributesIDBClass extends BaseIDBModelClass<"ModelWithOptionalRelationToUniqueAttributes"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "ModelWithOptionalRelationToUniqueAttributes");
  }

  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, R, W>(
      records,
      whereClause,
      tx,
      this.keyPath,
      this._applyWhereClause.bind(this),
    );
    return (
      await Promise.all(
        records.map(async (record) => {
          const stringFields = ["id"] as const;
          for (const field of stringFields) {
            if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;
          }
          const numberFields = ["linkId"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          if (whereClause.link === null) {
            if (record.linkId !== null) return null;
          }
          if (whereClause.link) {
            const { is, isNot, ...rest } = whereClause.link;
            if (is === null) {
              if (record.linkId !== null) return null;
            }
            if (is !== null && is !== undefined) {
              if (record.linkId === null) return null;
              const relatedRecord = await this.client.modelWithUniqueAttributes.findFirst(
                { where: { ...is, id: record.linkId } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
            if (isNot === null) {
              if (record.linkId === null) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              if (record.linkId === null) return null;
              const relatedRecord = await this.client.modelWithUniqueAttributes.findFirst(
                { where: { ...isNot, id: record.linkId } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              if (record.linkId === null) return null;
              const relatedRecord = await this.client.modelWithUniqueAttributes.findFirst(
                { where: { ...whereClause.link, id: record.linkId } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
  }
  private _applySelectClause<
    S extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "findMany">["select"],
  >(
    records: Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<
        Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
        { select: S },
        "findFirstOrThrow"
      >[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of ["id", "link", "linkId"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<
      Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
      { select: S },
      "findFirstOrThrow"
    >[];
  }
  private async _applyRelations<
    Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "findMany">,
  >(
    records: Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.TransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "findFirstOrThrow">[]> {
    if (!query)
      return records as Prisma.Result<
        Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
        Q,
        "findFirstOrThrow"
      >[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_link = query.select?.link || query.include?.link;
      if (attach_link) {
        unsafeRecord["link"] =
          record.linkId === null
            ? null
            : await this.client.modelWithUniqueAttributes.findUnique(
                {
                  ...(attach_link === true ? {} : attach_link),
                  where: { id: record.linkId! },
                },
                { tx },
              );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<
      Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
      Q,
      "findFirstOrThrow"
    >[];
  }
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.ModelWithOptionalRelationToUniqueAttributesOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = ["id", "linkId"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
    if (orderByInput.link) {
      return record.linkId === null
        ? null
        : await this.client.modelWithUniqueAttributes._resolveOrderByKey(
            await this.client.modelWithUniqueAttributes.findFirstOrThrow({ where: { id: record.linkId } }),
            orderByInput.link,
            tx,
          );
    }
  }
  _resolveSortOrder(
    orderByInput: Prisma.ModelWithOptionalRelationToUniqueAttributesOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = ["id", "linkId"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    if (orderByInput.link) {
      return this.client.modelWithUniqueAttributes._resolveSortOrder(orderByInput.link);
    }
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<
    D extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "create">["data"],
  >(data: D, tx?: IDBUtils.ReadwriteTransactionType): Promise<D> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.id === undefined) {
      data.id = uuidv4();
    }
    if (data.linkId === undefined) {
      data.linkId = null;
    }
    return data;
  }
  _getNeededStoresForWhere<
    W extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "findMany">["where"],
  >(whereClause: W, neededStores: Set<StoreNames<PrismaIDBSchema>>) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
    if (whereClause.link) {
      neededStores.add("ModelWithUniqueAttributes");
      this.client.modelWithUniqueAttributes._getNeededStoresForWhere(whereClause.link, neededStores);
    }
  }
  _getNeededStoresForFind<
    Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "findMany">,
  >(query?: Q): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("ModelWithOptionalRelationToUniqueAttributes");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
      const orderBy_link = orderBy.find((clause) => clause.link);
      if (orderBy_link) {
        this.client.modelWithUniqueAttributes
          ._getNeededStoresForFind({ orderBy: orderBy_link.link })
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    if (query?.select?.link || query?.include?.link) {
      neededStores.add("ModelWithUniqueAttributes");
      if (typeof query.select?.link === "object") {
        this.client.modelWithUniqueAttributes
          ._getNeededStoresForFind(query.select.link)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.link === "object") {
        this.client.modelWithUniqueAttributes
          ._getNeededStoresForFind(query.include.link)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    return neededStores;
  }
  _getNeededStoresForCreate<
    D extends Partial<Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "create">["data"]>,
  >(data: D): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("ModelWithOptionalRelationToUniqueAttributes");
    if (data?.link) {
      neededStores.add("ModelWithUniqueAttributes");
      if (data.link.create) {
        const createData = Array.isArray(data.link.create) ? data.link.create : [data.link.create];
        createData.forEach((record) =>
          this.client.modelWithUniqueAttributes
            ._getNeededStoresForCreate(record)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.link.connectOrCreate) {
        IDBUtils.convertToArray(data.link.connectOrCreate).forEach((record) =>
          this.client.modelWithUniqueAttributes
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    if (data?.linkId !== undefined) {
      neededStores.add("ModelWithUniqueAttributes");
    }
    return neededStores;
  }
  _getNeededStoresForUpdate<
    Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "update">,
  >(query: Partial<Q>): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(
        query.data as Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "create">["data"],
      ),
    );
    if (query.data?.link?.connect) {
      neededStores.add("ModelWithUniqueAttributes");
      IDBUtils.convertToArray(query.data.link.connect).forEach((connect) => {
        this.client.modelWithUniqueAttributes._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.link?.disconnect) {
      neededStores.add("ModelWithUniqueAttributes");
      if (query.data?.link?.disconnect !== true) {
        IDBUtils.convertToArray(query.data.link.disconnect).forEach((disconnect) => {
          this.client.modelWithUniqueAttributes._getNeededStoresForWhere(disconnect, neededStores);
        });
      }
    }
    if (query.data?.link?.update) {
      neededStores.add("ModelWithUniqueAttributes");
      IDBUtils.convertToArray(query.data.link.update).forEach((update) => {
        this.client.modelWithUniqueAttributes
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.link?.upsert) {
      neededStores.add("ModelWithUniqueAttributes");
      IDBUtils.convertToArray(query.data.link.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.ModelWithUniqueAttributesDelegate,
          "update"
        >;
        this.client.modelWithUniqueAttributes
          ._getNeededStoresForUpdate(update)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.link?.delete) {
      this.client.modelWithUniqueAttributes._getNeededStoresForNestedDelete(neededStores);
    }
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("ModelWithOptionalRelationToUniqueAttributes");
  }
  private _removeNestedCreateData<
    D extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "create">["data"],
  >(data: D): Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate?.link;
    return recordWithoutNestedCreate as Prisma.Result<
      Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
      object,
      "findFirstOrThrow"
    >;
  }
  private _preprocessListFields(
    records: Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, object, "findMany">,
  ): void {}
  async findMany<Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(
      await tx.objectStore("ModelWithOptionalRelationToUniqueAttributes").getAll(),
      query?.where,
      tx,
    );
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<
      Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
      Q,
      "findMany"
    >;
  }
  async findFirst<Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<
    Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "findFirstOrThrow">,
  >(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id !== undefined) {
      record = await tx.objectStore("ModelWithOptionalRelationToUniqueAttributes").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<
      Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
      Q,
      "findUnique"
    >;
  }
  async findUniqueOrThrow<
    Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "findUniqueOrThrow">,
  >(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["ModelWithOptionalRelationToUniqueAttributes"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "count">;
    }
    const result: Partial<
      Record<keyof Prisma.ModelWithOptionalRelationToUniqueAttributesCountAggregateInputType, number>
    > = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    query.data = query.data === undefined ? {} : query.data;
    if (query.data.link) {
      const fk: Partial<PrismaIDBSchema["ModelWithUniqueAttributes"]["key"]> = [];
      if (query.data.link?.create) {
        const record = await this.client.modelWithUniqueAttributes.create(
          { data: query.data.link.create },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.id;
      }
      if (query.data.link?.connect) {
        const record = await this.client.modelWithUniqueAttributes.findUniqueOrThrow(
          { where: query.data.link.connect },
          { tx },
        );
        delete query.data.link.connect;
        fk[0] = record.id;
      }
      if (query.data.link?.connectOrCreate) {
        const record = await this.client.modelWithUniqueAttributes.upsert(
          {
            where: query.data.link.connectOrCreate.where,
            create: query.data.link.connectOrCreate.create,
            update: {},
          },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.id;
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.linkId = fk[0];
      delete unsafeData.link;
    } else if (query.data?.linkId !== undefined && query.data.linkId !== null) {
      await this.client.modelWithUniqueAttributes.findUniqueOrThrow(
        {
          where: { id: query.data.linkId },
        },
        { tx },
      );
    }
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("ModelWithOptionalRelationToUniqueAttributes").add(record);
    const data = (await tx.objectStore("ModelWithOptionalRelationToUniqueAttributes").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<
      Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
      Q,
      "create"
    >;
  }
  async createMany<Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["ModelWithOptionalRelationToUniqueAttributes"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("ModelWithOptionalRelationToUniqueAttributes").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<
    Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "createManyAndReturn">,
  >(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["ModelWithOptionalRelationToUniqueAttributes"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("ModelWithOptionalRelationToUniqueAttributes").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<
      Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
      Q,
      "createManyAndReturn"
    >;
  }
  async delete<Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    await tx.objectStore("ModelWithOptionalRelationToUniqueAttributes").delete([record.id]);
    await this.emit("delete", [record.id], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete({ where: { id: record.id } }, { tx, silent, addToOutbox });
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["ModelWithOptionalRelationToUniqueAttributes"]["key"] = [record.id];
    const stringFields = ["id"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const intFields = ["linkId"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    if (query.data.link) {
      if (query.data.link.connect) {
        const other = await this.client.modelWithUniqueAttributes.findUniqueOrThrow(
          { where: query.data.link.connect },
          { tx },
        );
        record.linkId = other.id;
      }
      if (query.data.link.create) {
        const other = await this.client.modelWithUniqueAttributes.create(
          { data: query.data.link.create },
          { tx, silent, addToOutbox },
        );
        record.linkId = other.id;
      }
      if (query.data.link.update) {
        const updateData = query.data.link.update.data ?? query.data.link.update;
        await this.client.modelWithUniqueAttributes.update(
          {
            where: {
              ...query.data.link.update.where,
              id: record.linkId!,
            } as Prisma.ModelWithUniqueAttributesWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.link.upsert) {
        await this.client.modelWithUniqueAttributes.upsert(
          {
            where: {
              ...query.data.link.upsert.where,
              id: record.linkId!,
            } as Prisma.ModelWithUniqueAttributesWhereUniqueInput,
            create: { ...query.data.link.upsert.create, id: record.linkId! } as Prisma.Args<
              Prisma.ModelWithUniqueAttributesDelegate,
              "upsert"
            >["create"],
            update: query.data.link.upsert.update,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.link.connectOrCreate) {
        await this.client.modelWithUniqueAttributes.upsert(
          {
            where: { ...query.data.link.connectOrCreate.where, id: record.linkId! },
            create: { ...query.data.link.connectOrCreate.create, id: record.linkId! } as Prisma.Args<
              Prisma.ModelWithUniqueAttributesDelegate,
              "upsert"
            >["create"],
            update: { id: record.linkId! },
          },
          { tx: tx, silent, addToOutbox },
        );
      }
      if (query.data.link.disconnect) {
        record.linkId = null;
      }
      if (query.data.link.delete) {
        const deleteWhere = query.data.link.delete === true ? {} : query.data.link.delete;
        await this.client.modelWithUniqueAttributes.delete(
          { where: { ...deleteWhere, id: record.linkId! } } as Prisma.ModelWithUniqueAttributesDeleteArgs,
          { tx, silent, addToOutbox },
        );
        record.linkId = null;
      }
    }
    if (query.data.linkId !== undefined && record.linkId !== null) {
      const related = await this.client.modelWithUniqueAttributes.findUnique({ where: { id: record.linkId } }, { tx });
      if (!related) throw new Error("Related record not found");
    }
    const endKeyPath: PrismaIDBSchema["ModelWithOptionalRelationToUniqueAttributes"]["key"] = [record.id];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("ModelWithOptionalRelationToUniqueAttributes").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("ModelWithOptionalRelationToUniqueAttributes").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("ModelWithOptionalRelationToUniqueAttributes").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { id: keyPath[0] },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<
      Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
      Q,
      "update"
    >;
  }
  async updateMany<Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update({ where: { id: record.id }, data: query.data }, { tx, silent, addToOutbox });
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<
        Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
        "update"
      >["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow(
      { where: { id: record.id }, select: query.select, include: query.include },
      { tx },
    );
    return record as Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["ModelWithOptionalRelationToUniqueAttributes"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, Q, "aggregate">> =
      {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<
        Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
        Q,
        "aggregate"
      >["_min"];
      const numericFields = ["linkId"] as const;
      for (const field of numericFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as number) = Math.min(...values);
      }
      const stringFields = ["id"] as const;
      for (const field of stringFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as string) = values.sort()[0];
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<
        Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
        Q,
        "aggregate"
      >["_max"];
      const numericFields = ["linkId"] as const;
      for (const field of numericFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);
      }
      const stringFields = ["id"] as const;
      for (const field of stringFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
      }
      result._max = maxResult;
    }
    if (query?._avg) {
      const avgResult = {} as Prisma.Result<
        Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
        Q,
        "aggregate"
      >["_avg"];
      for (const untypedField of Object.keys(query._avg)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;
      }
      result._avg = avgResult;
    }
    if (query?._sum) {
      const sumResult = {} as Prisma.Result<
        Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
        Q,
        "aggregate"
      >["_sum"];
      for (const untypedField of Object.keys(query._sum)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);
      }
      result._sum = sumResult;
    }
    return result as unknown as Prisma.Result<
      Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
      Q,
      "aggregate"
    >;
  }
}
class ModelWithUniqueAttributesIDBClass extends BaseIDBModelClass<"ModelWithUniqueAttributes"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "ModelWithUniqueAttributes");
  }

  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.ModelWithUniqueAttributesDelegate, R, W>(
      records,
      whereClause,
      tx,
      this.keyPath,
      this._applyWhereClause.bind(this),
    );
    return (
      await Promise.all(
        records.map(async (record) => {
          const stringFields = ["code"] as const;
          for (const field of stringFields) {
            if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;
          }
          const numberFields = ["id"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          if (whereClause.links) {
            if (whereClause.links.every) {
              const violatingRecord = await this.client.modelWithOptionalRelationToUniqueAttributes.findFirst(
                {
                  where: { NOT: { ...whereClause.links.every }, linkId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
            if (whereClause.links.some) {
              const relatedRecords = await this.client.modelWithOptionalRelationToUniqueAttributes.findMany(
                {
                  where: { ...whereClause.links.some, linkId: record.id },
                },
                { tx },
              );
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.links.none) {
              const violatingRecord = await this.client.modelWithOptionalRelationToUniqueAttributes.findFirst(
                {
                  where: { ...whereClause.links.none, linkId: record.id },
                },
                { tx },
              );
              if (violatingRecord !== null) return null;
            }
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
  }
  private _applySelectClause<S extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of ["id", "code", "links"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, { select: S }, "findFirstOrThrow">[];
  }
  private async _applyRelations<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "findMany">>(
    records: Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.TransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_links = query.select?.links || query.include?.links;
      if (attach_links) {
        unsafeRecord["links"] = await this.client.modelWithOptionalRelationToUniqueAttributes.findMany(
          {
            ...(attach_links === true ? {} : attach_links),
            where: { linkId: record.id! },
          },
          { tx },
        );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<
      Prisma.ModelWithUniqueAttributesDelegate,
      Q,
      "findFirstOrThrow"
    >[];
  }
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.ModelWithUniqueAttributesOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = ["id", "code"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
    if (orderByInput.links) {
      return await this.client.modelWithOptionalRelationToUniqueAttributes.count(
        { where: { linkId: record.id } },
        { tx },
      );
    }
  }
  _resolveSortOrder(
    orderByInput: Prisma.ModelWithUniqueAttributesOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = ["id", "code"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    if (orderByInput.links?._count) {
      return orderByInput.links._count;
    }
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.id === undefined) {
      const transaction = tx ?? this.client._db.transaction(["ModelWithUniqueAttributes"], "readwrite");
      const store = transaction.objectStore("ModelWithUniqueAttributes");
      const cursor = await store.openCursor(null, "prev");
      data.id = cursor ? Number(cursor.key) + 1 : 1;
    }
    return data;
  }
  _getNeededStoresForWhere<W extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "findMany">["where"]>(
    whereClause: W,
    neededStores: Set<StoreNames<PrismaIDBSchema>>,
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
    if (whereClause.links) {
      neededStores.add("ModelWithOptionalRelationToUniqueAttributes");
      this.client.modelWithOptionalRelationToUniqueAttributes._getNeededStoresForWhere(
        whereClause.links.every,
        neededStores,
      );
      this.client.modelWithOptionalRelationToUniqueAttributes._getNeededStoresForWhere(
        whereClause.links.some,
        neededStores,
      );
      this.client.modelWithOptionalRelationToUniqueAttributes._getNeededStoresForWhere(
        whereClause.links.none,
        neededStores,
      );
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("ModelWithUniqueAttributes");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
      const orderBy_links = orderBy.find((clause) => clause.links);
      if (orderBy_links) {
        neededStores.add("ModelWithOptionalRelationToUniqueAttributes");
      }
    }
    if (query?.select?.links || query?.include?.links) {
      neededStores.add("ModelWithOptionalRelationToUniqueAttributes");
      if (typeof query.select?.links === "object") {
        this.client.modelWithOptionalRelationToUniqueAttributes
          ._getNeededStoresForFind(query.select.links)
          .forEach((storeName) => neededStores.add(storeName));
      }
      if (typeof query.include?.links === "object") {
        this.client.modelWithOptionalRelationToUniqueAttributes
          ._getNeededStoresForFind(query.include.links)
          .forEach((storeName) => neededStores.add(storeName));
      }
    }
    return neededStores;
  }
  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("ModelWithUniqueAttributes");
    if (data?.links) {
      neededStores.add("ModelWithOptionalRelationToUniqueAttributes");
      if (data.links.create) {
        const createData = Array.isArray(data.links.create) ? data.links.create : [data.links.create];
        createData.forEach((record) =>
          this.client.modelWithOptionalRelationToUniqueAttributes
            ._getNeededStoresForCreate(record)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.links.connectOrCreate) {
        IDBUtils.convertToArray(data.links.connectOrCreate).forEach((record) =>
          this.client.modelWithOptionalRelationToUniqueAttributes
            ._getNeededStoresForCreate(record.create)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
      if (data.links.createMany) {
        IDBUtils.convertToArray(data.links.createMany.data).forEach((record) =>
          this.client.modelWithOptionalRelationToUniqueAttributes
            ._getNeededStoresForCreate(record)
            .forEach((storeName) => neededStores.add(storeName)),
        );
      }
    }
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "update">>(
    query: Partial<Q>,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(
        query.data as Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "create">["data"],
      ),
    );
    if (query.data?.links?.connect) {
      neededStores.add("ModelWithOptionalRelationToUniqueAttributes");
      IDBUtils.convertToArray(query.data.links.connect).forEach((connect) => {
        this.client.modelWithOptionalRelationToUniqueAttributes._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.links?.set) {
      neededStores.add("ModelWithOptionalRelationToUniqueAttributes");
      IDBUtils.convertToArray(query.data.links.set).forEach((setWhere) => {
        this.client.modelWithOptionalRelationToUniqueAttributes._getNeededStoresForWhere(setWhere, neededStores);
      });
    }
    if (query.data?.links?.updateMany) {
      neededStores.add("ModelWithOptionalRelationToUniqueAttributes");
      IDBUtils.convertToArray(query.data.links.updateMany).forEach((update) => {
        this.client.modelWithOptionalRelationToUniqueAttributes
          ._getNeededStoresForUpdate(
            update as Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "update">,
          )
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.links?.update) {
      neededStores.add("ModelWithOptionalRelationToUniqueAttributes");
      IDBUtils.convertToArray(query.data.links.update).forEach((update) => {
        this.client.modelWithOptionalRelationToUniqueAttributes
          ._getNeededStoresForUpdate(
            update as Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "update">,
          )
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.links?.upsert) {
      neededStores.add("ModelWithOptionalRelationToUniqueAttributes");
      IDBUtils.convertToArray(query.data.links.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
          "update"
        >;
        this.client.modelWithOptionalRelationToUniqueAttributes
          ._getNeededStoresForUpdate(update)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.links?.delete || query.data?.links?.deleteMany) {
      this.client.modelWithOptionalRelationToUniqueAttributes._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.id !== undefined) {
      neededStores.add("ModelWithOptionalRelationToUniqueAttributes");
    }
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("ModelWithUniqueAttributes");
    this.client.modelWithOptionalRelationToUniqueAttributes._getNeededStoresForNestedDelete(neededStores);
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate?.links;
    return recordWithoutNestedCreate as Prisma.Result<
      Prisma.ModelWithUniqueAttributesDelegate,
      object,
      "findFirstOrThrow"
    >;
  }
  private _preprocessListFields(
    records: Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, object, "findMany">,
  ): void {}
  async findMany<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(
      await tx.objectStore("ModelWithUniqueAttributes").getAll(),
      query?.where,
      tx,
    );
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.ModelWithUniqueAttributesDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "findFirstOrThrow">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id !== undefined) {
      record = await tx.objectStore("ModelWithUniqueAttributes").get([query.where.id]);
    } else if (query.where.code !== undefined) {
      record = await tx.objectStore("ModelWithUniqueAttributes").index("codeIndex").get([query.where.code]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["ModelWithUniqueAttributes"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.ModelWithUniqueAttributesCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("ModelWithUniqueAttributes").add(record);
    if (query.data?.links?.create) {
      for (const elem of IDBUtils.convertToArray(query.data.links.create)) {
        await this.client.modelWithOptionalRelationToUniqueAttributes.create(
          {
            data: { ...elem, link: { connect: { id: keyPath[0] } } } as Prisma.Args<
              Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
              "create"
            >["data"],
          },
          { tx, silent, addToOutbox },
        );
      }
    }
    if (query.data?.links?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.links.connect).map(async (connectWhere) => {
          await this.client.modelWithOptionalRelationToUniqueAttributes.update(
            { where: connectWhere, data: { linkId: keyPath[0] } },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.links?.connectOrCreate) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.links.connectOrCreate).map(async (connectOrCreate) => {
          await this.client.modelWithOptionalRelationToUniqueAttributes.upsert(
            {
              where: connectOrCreate.where,
              create: { ...connectOrCreate.create, linkId: keyPath[0] } as NonNullable<
                Prisma.Args<Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate, "create">["data"]
              >,
              update: { linkId: keyPath[0] },
            },
            { tx, silent, addToOutbox },
          );
        }),
      );
    }
    if (query.data?.links?.createMany) {
      await this.client.modelWithOptionalRelationToUniqueAttributes.createMany(
        {
          data: IDBUtils.convertToArray(query.data.links.createMany.data).map((createData) => ({
            ...createData,
            linkId: keyPath[0],
          })),
        },
        { tx, silent, addToOutbox },
      );
    }
    const data = (await tx.objectStore("ModelWithUniqueAttributes").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["ModelWithUniqueAttributes"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("ModelWithUniqueAttributes").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["ModelWithUniqueAttributes"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("ModelWithUniqueAttributes").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "createManyAndReturn">;
  }
  async delete<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    await this.client.modelWithOptionalRelationToUniqueAttributes.updateMany(
      {
        where: { linkId: record.id },
        data: { linkId: null },
      },
      { tx, silent, addToOutbox },
    );
    await tx.objectStore("ModelWithUniqueAttributes").delete([record.id]);
    await this.emit("delete", [record.id], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete({ where: { id: record.id } }, { tx, silent, addToOutbox });
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["ModelWithUniqueAttributes"]["key"] = [record.id];
    const stringFields = ["code"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const intFields = ["id"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    if (query.data.links) {
      if (query.data.links.connect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.links.connect).map(async (connectWhere) => {
            await this.client.modelWithOptionalRelationToUniqueAttributes.update(
              { where: connectWhere, data: { linkId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.links.disconnect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.links.disconnect).map(async (connectWhere) => {
            await this.client.modelWithOptionalRelationToUniqueAttributes.update(
              { where: connectWhere, data: { linkId: null } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.links.create) {
        const createData = Array.isArray(query.data.links.create) ? query.data.links.create : [query.data.links.create];
        for (const elem of createData) {
          await this.client.modelWithOptionalRelationToUniqueAttributes.create(
            {
              data: { ...elem, linkId: record.id } as Prisma.Args<
                Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
                "create"
              >["data"],
            },
            { tx, silent, addToOutbox },
          );
        }
      }
      if (query.data.links.createMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.links.createMany.data).map(async (createData) => {
            await this.client.modelWithOptionalRelationToUniqueAttributes.create(
              { data: { ...createData, linkId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.links.update) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.links.update).map(async (updateData) => {
            await this.client.modelWithOptionalRelationToUniqueAttributes.update(updateData, {
              tx,
              silent,
              addToOutbox,
            });
          }),
        );
      }
      if (query.data.links.updateMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.links.updateMany).map(async (updateData) => {
            await this.client.modelWithOptionalRelationToUniqueAttributes.updateMany(updateData, {
              tx,
              silent,
              addToOutbox,
            });
          }),
        );
      }
      if (query.data.links.upsert) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.links.upsert).map(async (upsertData) => {
            await this.client.modelWithOptionalRelationToUniqueAttributes.upsert(
              {
                ...upsertData,
                where: { ...upsertData.where, linkId: record.id },
                create: { ...upsertData.create, linkId: record.id } as Prisma.Args<
                  Prisma.ModelWithOptionalRelationToUniqueAttributesDelegate,
                  "upsert"
                >["create"],
              },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.links.delete) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.links.delete).map(async (deleteData) => {
            await this.client.modelWithOptionalRelationToUniqueAttributes.delete(
              { where: { ...deleteData, linkId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.links.deleteMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.links.deleteMany).map(async (deleteData) => {
            await this.client.modelWithOptionalRelationToUniqueAttributes.deleteMany(
              { where: { ...deleteData, linkId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
      if (query.data.links.set) {
        const existing = await this.client.modelWithOptionalRelationToUniqueAttributes.findMany(
          { where: { linkId: record.id } },
          { tx },
        );
        if (existing.length > 0) {
          await this.client.modelWithOptionalRelationToUniqueAttributes.updateMany(
            { where: { linkId: record.id }, data: { linkId: null } },
            { tx, silent, addToOutbox },
          );
        }
        await Promise.all(
          IDBUtils.convertToArray(query.data.links.set).map(async (setData) => {
            await this.client.modelWithOptionalRelationToUniqueAttributes.update(
              { where: setData, data: { linkId: record.id } },
              { tx, silent, addToOutbox },
            );
          }),
        );
      }
    }
    const endKeyPath: PrismaIDBSchema["ModelWithUniqueAttributes"]["key"] = [record.id];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("ModelWithUniqueAttributes").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("ModelWithUniqueAttributes").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("ModelWithUniqueAttributes").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        await this.client.modelWithOptionalRelationToUniqueAttributes.updateMany(
          {
            where: { linkId: startKeyPath[0] },
            data: { linkId: endKeyPath[0] },
          },
          { tx, silent, addToOutbox },
        );
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { id: keyPath[0] },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update({ where: { id: record.id }, data: query.data }, { tx, silent, addToOutbox });
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<
        Prisma.ModelWithUniqueAttributesDelegate,
        "update"
      >["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow(
      { where: { id: record.id }, select: query.select, include: query.include },
      { tx },
    );
    return record as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.ModelWithUniqueAttributesDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["ModelWithUniqueAttributes"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "aggregate">> = {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "aggregate">["_min"];
      const numericFields = ["id"] as const;
      for (const field of numericFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as number) = Math.min(...values);
      }
      const stringFields = ["code"] as const;
      for (const field of stringFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as string) = values.sort()[0];
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "aggregate">["_max"];
      const numericFields = ["id"] as const;
      for (const field of numericFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);
      }
      const stringFields = ["code"] as const;
      for (const field of stringFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
      }
      result._max = maxResult;
    }
    if (query?._avg) {
      const avgResult = {} as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "aggregate">["_avg"];
      for (const untypedField of Object.keys(query._avg)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;
      }
      result._avg = avgResult;
    }
    if (query?._sum) {
      const sumResult = {} as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "aggregate">["_sum"];
      for (const untypedField of Object.keys(query._sum)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);
      }
      result._sum = sumResult;
    }
    return result as unknown as Prisma.Result<Prisma.ModelWithUniqueAttributesDelegate, Q, "aggregate">;
  }
}
class TodoIDBClass extends BaseIDBModelClass<"Todo"> {
  constructor(client: PrismaIDBClient, keyPath: string[]) {
    super(client, keyPath, "Todo");
  }

  private async _applyWhereClause<
    W extends Prisma.Args<Prisma.TodoDelegate, "findFirstOrThrow">["where"],
    R extends Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow">,
  >(records: R[], whereClause: W, tx: IDBUtils.TransactionType): Promise<R[]> {
    if (!whereClause) return records;
    records = await IDBUtils.applyLogicalFilters<Prisma.TodoDelegate, R, W>(
      records,
      whereClause,
      tx,
      this.keyPath,
      this._applyWhereClause.bind(this),
    );
    return (
      await Promise.all(
        records.map(async (record) => {
          const stringFields = ["id", "title"] as const;
          for (const field of stringFields) {
            if (!IDBUtils.whereStringFilter(record, field, whereClause[field])) return null;
          }
          const numberFields = ["userId"] as const;
          for (const field of numberFields) {
            if (!IDBUtils.whereNumberFilter(record, field, whereClause[field])) return null;
          }
          const booleanFields = ["completed"] as const;
          for (const field of booleanFields) {
            if (!IDBUtils.whereBoolFilter(record, field, whereClause[field])) return null;
          }
          if (whereClause.user) {
            const { is, isNot, ...rest } = whereClause.user;
            if (is !== null && is !== undefined) {
              const relatedRecord = await this.client.user.findFirst({ where: { ...is, id: record.userId } }, { tx });
              if (!relatedRecord) return null;
            }
            if (isNot !== null && isNot !== undefined) {
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...isNot, id: record.userId } },
                { tx },
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...whereClause.user, id: record.userId } },
                { tx },
              );
              if (!relatedRecord) return null;
            }
          }
          return record;
        }),
      )
    ).filter((result) => result !== null);
  }
  private _applySelectClause<S extends Prisma.Args<Prisma.TodoDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow">[],
    selectClause: S,
  ): Prisma.Result<Prisma.TodoDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.TodoDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of ["id", "title", "completed", "user", "userId"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.TodoDelegate, { select: S }, "findFirstOrThrow">[];
  }
  private async _applyRelations<Q extends Prisma.Args<Prisma.TodoDelegate, "findMany">>(
    records: Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.TransactionType,
    query?: Q,
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.TodoDelegate, Q, "findFirstOrThrow">[];
    const recordsWithRelations = records.map(async (record) => {
      const unsafeRecord = record as Record<string, unknown>;
      const attach_user = query.select?.user || query.include?.user;
      if (attach_user) {
        unsafeRecord["user"] = await this.client.user.findUnique(
          {
            ...(attach_user === true ? {} : attach_user),
            where: { id: record.userId! },
          },
          { tx },
        );
      }
      return unsafeRecord;
    });
    return (await Promise.all(recordsWithRelations)) as Prisma.Result<Prisma.TodoDelegate, Q, "findFirstOrThrow">[];
  }
  async _applyOrderByClause<
    O extends Prisma.Args<Prisma.TodoDelegate, "findMany">["orderBy"],
    R extends Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow">,
  >(records: R[], orderByClause: O, tx: IDBUtils.TransactionType): Promise<void> {
    if (orderByClause === undefined) return;
    const orderByClauses = IDBUtils.convertToArray(orderByClause);
    const indexedKeys = await Promise.all(
      records.map(async (record) => {
        const keys = await Promise.all(
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx)),
        );
        return { keys, record };
      }),
    );
    indexedKeys.sort((a, b) => {
      for (let i = 0; i < orderByClauses.length; i++) {
        const clause = orderByClauses[i];
        const comparison = IDBUtils.genericComparator(a.keys[i], b.keys[i], this._resolveSortOrder(clause));
        if (comparison !== 0) return comparison;
      }
      return 0;
    });
    for (let i = 0; i < records.length; i++) {
      records[i] = indexedKeys[i].record;
    }
  }
  async _resolveOrderByKey(
    record: Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow">,
    orderByInput: Prisma.TodoOrderByWithRelationInput,
    tx: IDBUtils.TransactionType,
  ): Promise<unknown> {
    const scalarFields = ["id", "title", "completed", "userId"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
    if (orderByInput.user) {
      return await this.client.user._resolveOrderByKey(
        await this.client.user.findFirstOrThrow({ where: { id: record.userId } }),
        orderByInput.user,
        tx,
      );
    }
  }
  _resolveSortOrder(
    orderByInput: Prisma.TodoOrderByWithRelationInput,
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = ["id", "title", "completed", "userId"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    if (orderByInput.user) {
      return this.client.user._resolveSortOrder(orderByInput.user);
    }
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.TodoDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType,
  ): Promise<D> {
    if (data === undefined) data = {} as NonNullable<D>;
    if (data.id === undefined) {
      data.id = uuidv4();
    }
    if (data.completed === undefined) {
      data.completed = false;
    }
    return data;
  }
  _getNeededStoresForWhere<W extends Prisma.Args<Prisma.TodoDelegate, "findMany">["where"]>(
    whereClause: W,
    neededStores: Set<StoreNames<PrismaIDBSchema>>,
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
    if (whereClause.user) {
      neededStores.add("User");
      this.client.user._getNeededStoresForWhere(whereClause.user, neededStores);
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.TodoDelegate, "findMany">>(
    query?: Q,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Todo");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
      const orderBy_user = orderBy.find((clause) => clause.user);
      if (orderBy_user) {
        this.client.user
          ._getNeededStoresForFind({ orderBy: orderBy_user.user })
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
  _getNeededStoresForCreate<D extends Partial<Prisma.Args<Prisma.TodoDelegate, "create">["data"]>>(
    data: D,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Todo");
    if (data?.user) {
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
    if (data?.userId !== undefined) {
      neededStores.add("User");
    }
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.TodoDelegate, "update">>(
    query: Partial<Q>,
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.TodoDelegate, "create">["data"]),
    );
    if (query.data?.user?.connect) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.connect).forEach((connect) => {
        this.client.user._getNeededStoresForWhere(connect, neededStores);
      });
    }
    if (query.data?.user?.update) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.update).forEach((update) => {
        this.client.user
          ._getNeededStoresForUpdate(update as Prisma.Args<Prisma.UserDelegate, "update">)
          .forEach((store) => neededStores.add(store));
      });
    }
    if (query.data?.user?.upsert) {
      neededStores.add("User");
      IDBUtils.convertToArray(query.data.user.upsert).forEach((upsert) => {
        const update = { where: upsert.where, data: { ...upsert.update, ...upsert.create } } as Prisma.Args<
          Prisma.UserDelegate,
          "update"
        >;
        this.client.user._getNeededStoresForUpdate(update).forEach((store) => neededStores.add(store));
      });
    }
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("Todo");
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.TodoDelegate, "create">["data"]>(
    data: D,
  ): Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate?.user;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.TodoDelegate, object, "findMany">): void {}
  async findMany<Q extends Prisma.Args<Prisma.TodoDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const records = await this._applyWhereClause(await tx.objectStore("Todo").getAll(), query?.where, tx);
    await this._applyOrderByClause(records, query?.orderBy, tx);
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.TodoDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    let selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      selectAppliedRecords = selectAppliedRecords.filter((record) => {
        const key = distinctFields.map((field) => record[field]).join("|");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.TodoDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.TodoDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "findFirst">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    return (await this.findMany(query, { tx }))[0] ?? null;
  }
  async findFirstOrThrow<Q extends Prisma.Args<Prisma.TodoDelegate, "findFirstOrThrow">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.TodoDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "findUnique">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let record;
    if (query.where.id !== undefined) {
      record = await tx.objectStore("Todo").get([query.where.id]);
    }
    if (!record) return null;

    const recordWithRelations = this._applySelectClause(
      await this._applyRelations(await this._applyWhereClause([record], query.where, tx), tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.TodoDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.TodoDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      tx.abort();
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.TodoDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "count">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Todo"], "readonly");
    if (!query?.select || query.select === true) {
      const records = await this.findMany({ where: query?.where }, { tx });
      return records.length as Prisma.Result<Prisma.TodoDelegate, Q, "count">;
    }
    const result: Partial<Record<keyof Prisma.TodoCountAggregateInputType, number>> = {};
    for (const key of Object.keys(query.select)) {
      const typedKey = key as keyof typeof query.select;
      if (typedKey === "_all") {
        result[typedKey] = (await this.findMany({ where: query.where }, { tx })).length;
        continue;
      }
      result[typedKey] = (await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })).length;
    }
    return result as Prisma.Result<Prisma.TodoDelegate, Q, "count">;
  }
  async create<Q extends Prisma.Args<Prisma.TodoDelegate, "create">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    if (query.data.user) {
      const fk: Partial<PrismaIDBSchema["User"]["key"]> = [];
      if (query.data.user?.create) {
        const record = await this.client.user.create({ data: query.data.user.create }, { tx, silent, addToOutbox });
        fk[0] = record.id;
      }
      if (query.data.user?.connect) {
        const record = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, { tx });
        delete query.data.user.connect;
        fk[0] = record.id;
      }
      if (query.data.user?.connectOrCreate) {
        const record = await this.client.user.upsert(
          {
            where: query.data.user.connectOrCreate.where,
            create: query.data.user.connectOrCreate.create,
            update: {},
          },
          { tx, silent, addToOutbox },
        );
        fk[0] = record.id;
      }
      const unsafeData = query.data as Record<string, unknown>;
      unsafeData.userId = fk[0];
      delete unsafeData.user;
    } else if (query.data?.userId !== undefined && query.data.userId !== null) {
      await this.client.user.findUniqueOrThrow(
        {
          where: { id: query.data.userId },
        },
        { tx },
      );
    }
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("Todo").add(record);
    const data = (await tx.objectStore("Todo").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select,
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, silent, addToOutbox);
    return recordsWithRelations as Prisma.Result<Prisma.TodoDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.TodoDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    tx = tx ?? this.client._db.transaction(["Todo"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Todo").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.TodoDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.TodoDelegate, object, "findMany"> = [];
    tx = tx ?? this.client._db.transaction(["Todo"], "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Todo").add(record);
      await this.emit("create", keyPath, undefined, record, silent, addToOutbox);
      records.push(this._applySelectClause([record], query.select)[0]);
    }
    this._preprocessListFields(records);
    return records as Prisma.Result<Prisma.TodoDelegate, Q, "createManyAndReturn">;
  }
  async delete<Q extends Prisma.Args<Prisma.TodoDelegate, "delete">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    await tx.objectStore("Todo").delete([record.id]);
    await this.emit("delete", [record.id], undefined, record, silent, addToOutbox);
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.TodoDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "deleteMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const records = await this.findMany(query, { tx });
    for (const record of records) {
      await this.delete({ where: { id: record.id } }, { tx, silent, addToOutbox });
    }
    return { count: records.length };
  }
  async update<Q extends Prisma.Args<Prisma.TodoDelegate, "update">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "update">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForUpdate(query)), "readwrite");
    const record = await this.findUnique({ where: query.where }, { tx });
    if (record === null) {
      tx.abort();
      throw new Error("Record not found");
    }
    const startKeyPath: PrismaIDBSchema["Todo"]["key"] = [record.id];
    const stringFields = ["id", "title"] as const;
    for (const field of stringFields) {
      IDBUtils.handleStringUpdateField(record, field, query.data[field]);
    }
    const booleanFields = ["completed"] as const;
    for (const field of booleanFields) {
      IDBUtils.handleBooleanUpdateField(record, field, query.data[field]);
    }
    const intFields = ["userId"] as const;
    for (const field of intFields) {
      IDBUtils.handleIntUpdateField(record, field, query.data[field]);
    }
    if (query.data.user) {
      if (query.data.user.connect) {
        const other = await this.client.user.findUniqueOrThrow({ where: query.data.user.connect }, { tx });
        record.userId = other.id;
      }
      if (query.data.user.create) {
        const other = await this.client.user.create({ data: query.data.user.create }, { tx, silent, addToOutbox });
        record.userId = other.id;
      }
      if (query.data.user.update) {
        const updateData = query.data.user.update.data ?? query.data.user.update;
        await this.client.user.update(
          {
            where: { ...query.data.user.update.where, id: record.userId! } as Prisma.UserWhereUniqueInput,
            data: updateData,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.user.upsert) {
        await this.client.user.upsert(
          {
            where: { ...query.data.user.upsert.where, id: record.userId! } as Prisma.UserWhereUniqueInput,
            create: { ...query.data.user.upsert.create, id: record.userId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: query.data.user.upsert.update,
          },
          { tx, silent, addToOutbox },
        );
      }
      if (query.data.user.connectOrCreate) {
        await this.client.user.upsert(
          {
            where: { ...query.data.user.connectOrCreate.where, id: record.userId! },
            create: { ...query.data.user.connectOrCreate.create, id: record.userId! } as Prisma.Args<
              Prisma.UserDelegate,
              "upsert"
            >["create"],
            update: { id: record.userId! },
          },
          { tx: tx, silent, addToOutbox },
        );
      }
    }
    if (query.data.userId !== undefined) {
      const related = await this.client.user.findUnique({ where: { id: record.userId } }, { tx });
      if (!related) throw new Error("Related record not found");
    }
    const endKeyPath: PrismaIDBSchema["Todo"]["key"] = [record.id];
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        if ((await tx.objectStore("Todo").get(endKeyPath)) !== undefined) {
          throw new Error("Record with the same keyPath already exists");
        }
        await tx.objectStore("Todo").delete(startKeyPath);
        break;
      }
    }
    const keyPath = await tx.objectStore("Todo").put(record);
    await this.emit("update", keyPath, startKeyPath, record, silent, addToOutbox);
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { id: keyPath[0] },
      },
      { tx },
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.TodoDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.TodoDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update({ where: { id: record.id }, data: query.data }, { tx, silent, addToOutbox });
      }),
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.TodoDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "upsert">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const neededStores = this._getNeededStoresForUpdate({
      ...query,
      data: { ...query.update, ...query.create } as Prisma.Args<Prisma.TodoDelegate, "update">["data"],
    });
    tx = tx ?? this.client._db.transaction(Array.from(neededStores), "readwrite");
    let record = await this.findUnique({ where: query.where }, { tx });
    if (!record) record = await this.create({ data: query.create }, { tx, silent, addToOutbox });
    else record = await this.update({ where: query.where, data: query.update }, { tx, silent, addToOutbox });
    record = await this.findUniqueOrThrow(
      { where: { id: record.id }, select: query.select, include: query.include },
      { tx },
    );
    return record as Prisma.Result<Prisma.TodoDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.TodoDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    },
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "aggregate">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(["Todo"], "readonly");
    const records = await this.findMany({ where: query?.where }, { tx });
    const result: Partial<Prisma.Result<Prisma.TodoDelegate, Q, "aggregate">> = {};
    if (query?._count) {
      if (query._count === true) {
        (result._count as number) = records.length;
      } else {
        for (const key of Object.keys(query._count)) {
          const typedKey = key as keyof typeof query._count;
          if (typedKey === "_all") {
            (result._count as Record<string, number>)[typedKey] = records.length;
            continue;
          }
          (result._count as Record<string, number>)[typedKey] = (
            await this.findMany({ where: { [`${typedKey}`]: { not: null } } }, { tx })
          ).length;
        }
      }
    }
    if (query?._min) {
      const minResult = {} as Prisma.Result<Prisma.TodoDelegate, Q, "aggregate">["_min"];
      const numericFields = ["userId"] as const;
      for (const field of numericFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as number) = Math.min(...values);
      }
      const stringFields = ["id", "title"] as const;
      for (const field of stringFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as string) = values.sort()[0];
      }
      const booleanFields = ["completed"] as const;
      for (const field of booleanFields) {
        if (!query._min[field]) continue;
        const values = records.map((record) => record[field] as boolean).filter((value) => value !== undefined);
        (minResult[field as keyof typeof minResult] as boolean) =
          values.length === 0 ? false : values.includes(false) ? false : true;
      }
      result._min = minResult;
    }
    if (query?._max) {
      const maxResult = {} as Prisma.Result<Prisma.TodoDelegate, Q, "aggregate">["_max"];
      const numericFields = ["userId"] as const;
      for (const field of numericFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as number).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as number) = Math.max(...values);
      }
      const stringFields = ["id", "title"] as const;
      for (const field of stringFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as string).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as string) = values.sort().reverse()[0];
      }
      const booleanFields = ["completed"] as const;
      for (const field of booleanFields) {
        if (!query._max[field]) continue;
        const values = records.map((record) => record[field] as boolean).filter((value) => value !== undefined);
        (maxResult[field as keyof typeof maxResult] as boolean) = values.length === 0 ? false : values.includes(true);
      }
      result._max = maxResult;
    }
    if (query?._avg) {
      const avgResult = {} as Prisma.Result<Prisma.TodoDelegate, Q, "aggregate">["_avg"];
      for (const untypedField of Object.keys(query._avg)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (avgResult[field as keyof typeof avgResult] as number) = values.reduce((a, b) => a + b, 0) / values.length;
      }
      result._avg = avgResult;
    }
    if (query?._sum) {
      const sumResult = {} as Prisma.Result<Prisma.TodoDelegate, Q, "aggregate">["_sum"];
      for (const untypedField of Object.keys(query._sum)) {
        const field = untypedField as keyof (typeof records)[number];
        const values = records.map((record) => record[field] as number);
        (sumResult[field as keyof typeof sumResult] as number) = values.reduce((a, b) => a + b, 0);
      }
      result._sum = sumResult;
    }
    return result as unknown as Prisma.Result<Prisma.TodoDelegate, Q, "aggregate">;
  }
}
