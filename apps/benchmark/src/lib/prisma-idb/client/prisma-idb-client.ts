/* eslint-disable @typescript-eslint/no-unused-vars */
import { openDB } from "idb";
import type { IDBPDatabase, StoreNames, IDBPTransaction } from "idb";
import type { Prisma } from "../../generated/prisma/client";
import * as IDBUtils from "./idb-utils";
import type { PrismaIDBSchema } from "./idb-interface";
import { v4 as uuidv4 } from "uuid";
const IDB_VERSION = 1;
export class PrismaIDBClient {
  private static instance: PrismaIDBClient;
  _db!: IDBPDatabase<PrismaIDBSchema>;
  private outboxEnabled: boolean = false;
  private includedModels: Set<string>;

  private constructor() {
    this.includedModels = new Set(["User", "Todo"]);
  }
  user!: UserIDBClass;
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
    if (!globalThis.indexedDB) throw new Error("IndexedDB is not available in this environment");
    this._db.close();
    try {
      await new Promise<void>((resolve, reject) => {
        const req = globalThis.indexedDB.deleteDatabase("prisma-idb");
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => {};
      });
    } catch (e) {
      await PrismaIDBClient.instance.initialize();
      throw e;
    }
    await PrismaIDBClient.instance.initialize();
  }
  shouldTrackModel(modelName: string): boolean {
    return this.outboxEnabled && this.includedModels.has(modelName);
  }
  private async initialize() {
    this._db = await openDB<PrismaIDBSchema>("prisma-idb", IDB_VERSION, {
      upgrade(db) {
        db.createObjectStore("User", { keyPath: ["id"] });
        const TodoStore = db.createObjectStore("Todo", { keyPath: ["id"] });
        TodoStore.createIndex("userIdIndex", ["userId"], { unique: false });
      },
    });
    this.user = new UserIDBClass(this, ["id"]);
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
    callback: (e: CustomEvent<{ keyPath: PrismaIDBSchema[T]["key"]; oldKeyPath?: PrismaIDBSchema[T]["key"] }>) => void
  ): () => void {
    if (Array.isArray(event)) {
      event.forEach((evt) => this.eventEmitter.addEventListener(evt, callback as EventListener));
      return () => {
        event.forEach((evt) => this.eventEmitter.removeEventListener(evt, callback as EventListener));
      };
    }
    this.eventEmitter.addEventListener(event, callback as EventListener);
    return () => {
      this.eventEmitter.removeEventListener(event, callback as EventListener);
    };
  }
  protected async emit(
    event: "create" | "update" | "delete",
    keyPath: PrismaIDBSchema[T]["key"],
    oldKeyPath?: PrismaIDBSchema[T]["key"],
    record?: unknown,
    opts?: { silent?: boolean; addToOutbox?: boolean; tx?: IDBUtils.ReadwriteTransactionType }
  ) {
    const shouldEmit = !opts?.silent;

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
      this._applyWhereClause.bind(this)
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
          if (whereClause.todos) {
            if (whereClause.todos.every) {
              const violatingRecord = await this.client.todo.findFirst(
                {
                  where: { NOT: { ...whereClause.todos.every }, userId: record.id },
                },
                { tx }
              );
              if (violatingRecord !== null) return null;
            }
            if (whereClause.todos.some) {
              const relatedRecords = await this.client.todo.findMany(
                {
                  where: { ...whereClause.todos.some, userId: record.id },
                },
                { tx }
              );
              if (relatedRecords.length === 0) return null;
            }
            if (whereClause.todos.none) {
              const violatingRecord = await this.client.todo.findFirst(
                {
                  where: { ...whereClause.todos.none, userId: record.id },
                },
                { tx }
              );
              if (violatingRecord !== null) return null;
            }
          }
          return record;
        })
      )
    ).filter((result) => result !== null);
  }
  private _applySelectClause<S extends Prisma.Args<Prisma.UserDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">[],
    selectClause: S
  ): Prisma.Result<Prisma.UserDelegate, { select: S }, "findFirstOrThrow">[] {
    if (!selectClause) {
      return records as Prisma.Result<Prisma.UserDelegate, { select: S }, "findFirstOrThrow">[];
    }
    return records.map((record) => {
      const partialRecord: Partial<typeof record> = record;
      for (const untypedKey of ["id", "name", "todos"]) {
        const key = untypedKey as keyof typeof record & keyof S;
        if (!selectClause[key]) delete partialRecord[key];
      }
      return partialRecord;
    }) as Prisma.Result<Prisma.UserDelegate, { select: S }, "findFirstOrThrow">[];
  }
  private async _applyRelations<Q extends Prisma.Args<Prisma.UserDelegate, "findMany">>(
    records: Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">[],
    tx: IDBUtils.TransactionType,
    query?: Q
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">[];
    const attach_todos = query.select?.todos || query.include?.todos;
    let todos_hashMap: Map<string, unknown[]> | undefined;
    if (attach_todos) {
      const todos_opts = (attach_todos === true ? {} : attach_todos) as Record<string, unknown>;
      const todos_sel = todos_opts.select as Record<string, boolean> | undefined;
      const todos_keysToInject = todos_sel ? (["userId"] as string[]).filter((k) => !todos_sel![k]) : [];
      const todos_take = todos_opts.take as number | undefined;
      const todos_skip = todos_opts.skip as number | undefined;
      const todos_cursor = todos_opts.cursor;
      const todos_distinct = todos_opts.distinct;
      const todos_parentIds = [...new Set(records.map((r) => r.id))];
      todos_hashMap = new Map<string, unknown[]>();
      const todos_userWhere = todos_opts.where as Record<string, unknown> | undefined;
      if (todos_cursor !== undefined || todos_distinct !== undefined) {
        for (const parentId of todos_parentIds) {
          const todos_perParentFkWhere = { userId: parentId };
          const todos_perParentWhere = todos_userWhere
            ? { AND: [todos_userWhere, todos_perParentFkWhere] }
            : todos_perParentFkWhere;
          const children = await this.client.todo.findMany(
            {
              ...todos_opts,
              ...(todos_keysToInject.length > 0
                ? { select: { ...todos_sel, ...Object.fromEntries(todos_keysToInject.map((k) => [k, true])) } }
                : {}),
              where: todos_perParentWhere,
            },
            { tx }
          );
          const stripped = children.map((c) => {
            const _r = c as Record<string, unknown>;
            return todos_keysToInject.length > 0
              ? Object.fromEntries(Object.entries(_r).filter(([k]) => !todos_keysToInject.includes(k)))
              : _r;
          });
          todos_hashMap!.set(JSON.stringify(parentId), stripped as unknown[]);
        }
      } else {
        const todos_fkWhere = { userId: { in: todos_parentIds } };
        const todos_where = todos_userWhere ? { AND: [todos_userWhere, todos_fkWhere] } : todos_fkWhere;
        const todos_allRelated = await this.client.todo.findMany(
          {
            ...todos_opts,
            ...(todos_keysToInject.length > 0
              ? { select: { ...todos_sel, ...Object.fromEntries(todos_keysToInject.map((k) => [k, true])) } }
              : {}),
            take: undefined,
            skip: undefined,
            where: todos_where,
          },
          { tx }
        );
        for (const related of todos_allRelated) {
          const _r = related as Record<string, unknown>;
          const key = JSON.stringify(_r["userId"]);
          if (!todos_hashMap!.has(key)) todos_hashMap!.set(key, []);
          const value =
            todos_keysToInject.length > 0
              ? Object.fromEntries(Object.entries(_r).filter(([k]) => !todos_keysToInject.includes(k)))
              : _r;
          todos_hashMap!.get(key)!.push(value as unknown);
        }
        if (todos_skip !== undefined || todos_take !== undefined) {
          if (todos_skip !== undefined && (!Number.isInteger(todos_skip) || todos_skip < 0))
            throw new Error("skip must be a non-negative integer");
          if (todos_take !== undefined && !Number.isInteger(todos_take)) throw new Error("take must be an integer");
          for (const [key, group] of todos_hashMap!) {
            let sliced = group;
            if (todos_skip !== undefined) sliced = sliced.slice(todos_skip);
            if (todos_take !== undefined)
              sliced = todos_take < 0 ? sliced.slice(todos_take) : sliced.slice(0, todos_take);
            todos_hashMap!.set(key, sliced);
          }
        }
      }
    }
    const recordsWithRelations = records.map((record) => {
      const unsafeRecord = record as Record<string, unknown>;
      if (attach_todos) {
        unsafeRecord["todos"] = (() => {
          const _v = todos_hashMap!.get(JSON.stringify(record.id));
          return _v == null ? [] : structuredClone(_v);
        })();
      }
      return unsafeRecord;
    });
    return recordsWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">[];
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
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx))
        );
        return { keys, record };
      })
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
    tx: IDBUtils.TransactionType
  ): Promise<unknown> {
    const scalarFields = ["id", "name"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
    if (orderByInput.todos) {
      return await this.client.todo.count({ where: { userId: record.id } }, { tx });
    }
  }
  _resolveSortOrder(
    orderByInput: Prisma.UserOrderByWithRelationInput
  ): Prisma.SortOrder | { sort: Prisma.SortOrder; nulls?: "first" | "last" } {
    const scalarFields = ["id", "name"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return orderByInput[field];
    if (orderByInput.todos?._count) {
      return orderByInput.todos._count;
    }
    throw new Error("No field in orderBy clause");
  }
  private async _fillDefaults<D extends Prisma.Args<Prisma.UserDelegate, "create">["data"]>(
    data: D,
    tx?: IDBUtils.ReadwriteTransactionType
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
    neededStores: Set<StoreNames<PrismaIDBSchema>>
  ) {
    if (whereClause === undefined) return;
    for (const param of IDBUtils.LogicalParams) {
      if (whereClause[param]) {
        for (const clause of IDBUtils.convertToArray(whereClause[param])) {
          this._getNeededStoresForWhere(clause, neededStores);
        }
      }
    }
    if (whereClause.todos) {
      neededStores.add("Todo");
      this.client.todo._getNeededStoresForWhere(whereClause.todos.every, neededStores);
      this.client.todo._getNeededStoresForWhere(whereClause.todos.some, neededStores);
      this.client.todo._getNeededStoresForWhere(whereClause.todos.none, neededStores);
    }
  }
  _getNeededStoresForFind<Q extends Prisma.Args<Prisma.UserDelegate, "findMany">>(
    query?: Q
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("User");
    this._getNeededStoresForWhere(query?.where, neededStores);
    if (query?.orderBy) {
      const orderBy = IDBUtils.convertToArray(query.orderBy);
      const orderBy_todos = orderBy.find((clause) => clause.todos);
      if (orderBy_todos) {
        neededStores.add("Todo");
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
    data: D
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("User");
    if (data?.todos) {
      neededStores.add("Todo");
      if (data.todos.create) {
        const createData = Array.isArray(data.todos.create) ? data.todos.create : [data.todos.create];
        createData.forEach((record) =>
          this.client.todo._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName))
        );
      }
      if (data.todos.connectOrCreate) {
        IDBUtils.convertToArray(data.todos.connectOrCreate).forEach((record) =>
          this.client.todo._getNeededStoresForCreate(record.create).forEach((storeName) => neededStores.add(storeName))
        );
      }
      if (data.todos.createMany) {
        IDBUtils.convertToArray(data.todos.createMany.data).forEach((record) =>
          this.client.todo._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName))
        );
      }
    }
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.UserDelegate, "update">>(
    query: Partial<Q>
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.UserDelegate, "create">["data"])
    );
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
    if (query.data?.todos?.delete || query.data?.todos?.deleteMany) {
      this.client.todo._getNeededStoresForNestedDelete(neededStores);
    }
    if (query.data?.id !== undefined) {
      neededStores.add("Todo");
    }
    return neededStores;
  }
  _getNeededStoresForNestedDelete(neededStores: Set<StoreNames<PrismaIDBSchema>>): void {
    neededStores.add("User");
    this.client.todo._getNeededStoresForNestedDelete(neededStores);
  }
  private _removeNestedCreateData<D extends Prisma.Args<Prisma.UserDelegate, "create">["data"]>(
    data: D
  ): Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate?.todos;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.UserDelegate, object, "findMany">): void {}
  private async _getRecords(
    tx: IDBUtils.TransactionType,
    where?: Prisma.Args<Prisma.UserDelegate, "findFirstOrThrow">["where"]
  ): Promise<Prisma.Result<Prisma.UserDelegate, object, "findFirstOrThrow">[]> {
    return tx.objectStore("User").getAll();
  }
  async findMany<Q extends Prisma.Args<Prisma.UserDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
    }
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let records = await this._applyWhereClause(await this._getRecords(tx, query?.where), query?.where, tx);
    await this._applyOrderByClause(records, query?.orderBy, tx);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      records = records.filter((record) => {
        const values = distinctFields.map((field) => record[field]);
        const key = JSON.stringify(values);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if (query?.skip !== undefined) {
      if (!Number.isInteger(query.skip) || query.skip < 0) {
        throw new Error("skip must be a non-negative integer");
      }
    }
    if (query?.take !== undefined) {
      if (!Number.isInteger(query.take)) {
        throw new Error("take must be an integer");
      }
    }
    if (query?.cursor) {
      let cursorIndex = -1;
      if ((query.cursor as Record<string, unknown>)["id"] !== undefined) {
        const normalizedCursor = query.cursor as Record<string, unknown>;
        cursorIndex = records.findIndex((record) => record.id === normalizedCursor.id);
      }
      if (cursorIndex === -1) {
        records = [];
      } else if (query.take !== undefined && query.take < 0) {
        const skip = query.skip ?? 0;
        const end = cursorIndex + 1 - skip;
        const start = end + query.take;
        records = records.slice(Math.max(0, start), Math.max(0, end));
      } else {
        records = records.slice(cursorIndex);
      }
    }
    if (!(query?.cursor && query?.take !== undefined && query.take < 0)) {
      if (query?.skip !== undefined) {
        records = records.slice(query.skip);
      }
      if (query?.take !== undefined) {
        if (query.take < 0) {
          records = records.slice(query.take);
        } else {
          records = records.slice(0, query.take);
        }
      }
    }
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.UserDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.UserDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.UserDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
    }
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
    }
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;

    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.UserDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
    }
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
      query.select
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.UserDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
    }
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;

    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.UserDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
    }
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
    }
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "create">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForCreate(query.data);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("User").add(record);
    if (query.data?.todos?.create) {
      for (const elem of IDBUtils.convertToArray(query.data.todos.create)) {
        await this.client.todo.create(
          {
            data: { ...elem, user: { connect: { id: keyPath[0] } } } as Prisma.Args<
              Prisma.TodoDelegate,
              "create"
            >["data"],
          },
          { tx, silent, addToOutbox }
        );
      }
    }
    if (query.data?.todos?.connect) {
      await Promise.all(
        IDBUtils.convertToArray(query.data.todos.connect).map(async (connectWhere) => {
          await this.client.todo.update(
            { where: connectWhere, data: { userId: keyPath[0] } },
            { tx, silent, addToOutbox }
          );
        })
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
            { tx, silent, addToOutbox }
          );
        })
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
        { tx, silent, addToOutbox }
      );
    }
    const data = (await tx.objectStore("User").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, { silent, addToOutbox, tx });
    return recordsWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.UserDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    }
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const storesNeeded: Set<StoreNames<PrismaIDBSchema>> = new Set(["User"]);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("User").add(record);
      await this.emit("create", keyPath, undefined, record, { silent, addToOutbox, tx });
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.UserDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    }
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.UserDelegate, object, "findMany"> = [];
    const storesNeeded: Set<StoreNames<PrismaIDBSchema>> = new Set(["User"]);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("User").add(record);
      await this.emit("create", keyPath, undefined, record, { silent, addToOutbox, tx });
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
    }
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    await this.client.todo.deleteMany(
      {
        where: { userId: record.id },
      },
      { tx, silent, addToOutbox }
    );
    await tx.objectStore("User").delete([record.id]);
    await this.emit("delete", [record.id], undefined, record, { silent, addToOutbox, tx });
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.UserDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    }
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
    }
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
    if (query.data.todos) {
      if (query.data.todos.connect) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.todos.connect).map(async (connectWhere) => {
            await this.client.todo.update(
              { where: connectWhere, data: { userId: record.id } },
              { tx, silent, addToOutbox }
            );
          })
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
            { tx, silent, addToOutbox }
          );
        }
      }
      if (query.data.todos.createMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.todos.createMany.data).map(async (createData) => {
            await this.client.todo.create({ data: { ...createData, userId: record.id } }, { tx, silent, addToOutbox });
          })
        );
      }
      if (query.data.todos.update) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.todos.update).map(async (updateData) => {
            await this.client.todo.update(updateData, { tx, silent, addToOutbox });
          })
        );
      }
      if (query.data.todos.updateMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.todos.updateMany).map(async (updateData) => {
            await this.client.todo.updateMany(updateData, { tx, silent, addToOutbox });
          })
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
              { tx, silent, addToOutbox }
            );
          })
        );
      }
      if (query.data.todos.delete) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.todos.delete).map(async (deleteData) => {
            await this.client.todo.delete({ where: { ...deleteData, userId: record.id } }, { tx, silent, addToOutbox });
          })
        );
      }
      if (query.data.todos.deleteMany) {
        await Promise.all(
          IDBUtils.convertToArray(query.data.todos.deleteMany).map(async (deleteData) => {
            await this.client.todo.deleteMany(
              { where: { ...deleteData, userId: record.id } },
              { tx, silent, addToOutbox }
            );
          })
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
          })
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
    await this.emit("update", keyPath, startKeyPath, record, { silent, addToOutbox, tx });
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        await this.client.todo.updateMany(
          {
            where: { userId: startKeyPath[0] },
            data: { userId: endKeyPath[0] },
          },
          { tx, silent, addToOutbox }
        );
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { id: keyPath[0] },
      },
      { tx }
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.UserDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.UserDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    }
  ): Promise<Prisma.Result<Prisma.UserDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update({ where: { id: record.id }, data: query.data }, { tx, silent, addToOutbox });
      })
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.UserDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    }
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
      { tx }
    );
    return record as Prisma.Result<Prisma.UserDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.UserDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
    }
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
      this._applyWhereClause.bind(this)
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
                { tx }
              );
              if (relatedRecord) return null;
            }
            if (Object.keys(rest).length) {
              const relatedRecord = await this.client.user.findFirst(
                { where: { ...whereClause.user, id: record.userId } },
                { tx }
              );
              if (!relatedRecord) return null;
            }
          }
          return record;
        })
      )
    ).filter((result) => result !== null);
  }
  private _applySelectClause<S extends Prisma.Args<Prisma.TodoDelegate, "findMany">["select"]>(
    records: Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow">[],
    selectClause: S
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
    query?: Q
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "findFirstOrThrow">[]> {
    if (!query) return records as Prisma.Result<Prisma.TodoDelegate, Q, "findFirstOrThrow">[];
    const attach_user = query.select?.user || query.include?.user;
    let user_hashMap: Map<string, unknown> | undefined;
    if (attach_user) {
      const user_opts = (attach_user === true ? {} : attach_user) as Record<string, unknown>;
      const user_sel = user_opts.select as Record<string, boolean> | undefined;
      const user_keysToInject = user_sel ? (["id"] as string[]).filter((k) => !user_sel![k]) : [];
      const user_fkValues = [...new Set(records.map((r) => r.userId).filter((v) => v !== null && v !== undefined))];
      const user_userWhere = user_opts.where as Record<string, unknown> | undefined;
      const user_fkWhere = { id: { in: user_fkValues } };
      const user_where = user_userWhere ? { AND: [user_userWhere, user_fkWhere] } : user_fkWhere;
      const user_related = await this.client.user.findMany(
        {
          ...user_opts,
          ...(user_keysToInject.length > 0
            ? { select: { ...user_sel, ...Object.fromEntries(user_keysToInject.map((k) => [k, true])) } }
            : {}),
          where: user_where,
        },
        { tx }
      );
      user_hashMap = new Map(
        user_related.map((r) => {
          const _r = r as Record<string, unknown>;
          const key = JSON.stringify(_r["id"]);
          const value =
            user_keysToInject.length > 0
              ? Object.fromEntries(Object.entries(_r).filter(([k]) => !user_keysToInject.includes(k)))
              : _r;
          return [key, value as unknown];
        })
      );
    }
    const recordsWithRelations = records.map((record) => {
      const unsafeRecord = record as Record<string, unknown>;
      if (attach_user) {
        unsafeRecord["user"] = (() => {
          const _v = user_hashMap!.get(JSON.stringify(record.userId));
          return _v == null ? null : structuredClone(_v);
        })();
      }
      return unsafeRecord;
    });
    return recordsWithRelations as Prisma.Result<Prisma.TodoDelegate, Q, "findFirstOrThrow">[];
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
          orderByClauses.map(async (clause) => await this._resolveOrderByKey(record, clause, tx))
        );
        return { keys, record };
      })
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
    tx: IDBUtils.TransactionType
  ): Promise<unknown> {
    const scalarFields = ["id", "title", "completed", "userId"] as const;
    for (const field of scalarFields) if (orderByInput[field]) return record[field];
    if (orderByInput.user) {
      return await this.client.user._resolveOrderByKey(
        await this.client.user.findFirstOrThrow({ where: { id: record.userId } }),
        orderByInput.user,
        tx
      );
    }
  }
  _resolveSortOrder(
    orderByInput: Prisma.TodoOrderByWithRelationInput
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
    tx?: IDBUtils.ReadwriteTransactionType
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
    neededStores: Set<StoreNames<PrismaIDBSchema>>
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
    query?: Q
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
    data: D
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores: Set<StoreNames<PrismaIDBSchema>> = new Set();
    neededStores.add("Todo");
    if (data?.user) {
      neededStores.add("User");
      if (data.user.create) {
        const createData = Array.isArray(data.user.create) ? data.user.create : [data.user.create];
        createData.forEach((record) =>
          this.client.user._getNeededStoresForCreate(record).forEach((storeName) => neededStores.add(storeName))
        );
      }
      if (data.user.connectOrCreate) {
        IDBUtils.convertToArray(data.user.connectOrCreate).forEach((record) =>
          this.client.user._getNeededStoresForCreate(record.create).forEach((storeName) => neededStores.add(storeName))
        );
      }
    }
    if (data?.userId !== undefined) {
      neededStores.add("User");
    }
    return neededStores;
  }
  _getNeededStoresForUpdate<Q extends Prisma.Args<Prisma.TodoDelegate, "update">>(
    query: Partial<Q>
  ): Set<StoreNames<PrismaIDBSchema>> {
    const neededStores = this._getNeededStoresForFind(query).union(
      this._getNeededStoresForCreate(query.data as Prisma.Args<Prisma.TodoDelegate, "create">["data"])
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
    data: D
  ): Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow"> {
    const recordWithoutNestedCreate = structuredClone(data);
    delete recordWithoutNestedCreate?.user;
    return recordWithoutNestedCreate as Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow">;
  }
  private _preprocessListFields(records: Prisma.Result<Prisma.TodoDelegate, object, "findMany">): void {}
  private async _getRecords(
    tx: IDBUtils.TransactionType,
    where?: Prisma.Args<Prisma.TodoDelegate, "findFirstOrThrow">["where"]
  ): Promise<Prisma.Result<Prisma.TodoDelegate, object, "findFirstOrThrow">[]> {
    if (!where) return tx.objectStore("Todo").getAll();
    const userIdEq = IDBUtils.extractEqualityValue(where.userId);

    if (userIdEq !== undefined) {
      return tx
        .objectStore("Todo")
        .index("userIdIndex")
        .getAll(IDBUtils.IDBKeyRange.only([userIdEq]));
    }

    return tx.objectStore("Todo").getAll();
  }
  async findMany<Q extends Prisma.Args<Prisma.TodoDelegate, "findMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
    }
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "findMany">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    let records = await this._applyWhereClause(await this._getRecords(tx, query?.where), query?.where, tx);
    await this._applyOrderByClause(records, query?.orderBy, tx);
    if (query?.distinct) {
      const distinctFields = IDBUtils.convertToArray(query.distinct);
      const seen = new Set<string>();
      records = records.filter((record) => {
        const values = distinctFields.map((field) => record[field]);
        const key = JSON.stringify(values);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if (query?.skip !== undefined) {
      if (!Number.isInteger(query.skip) || query.skip < 0) {
        throw new Error("skip must be a non-negative integer");
      }
    }
    if (query?.take !== undefined) {
      if (!Number.isInteger(query.take)) {
        throw new Error("take must be an integer");
      }
    }
    if (query?.cursor) {
      let cursorIndex = -1;
      if ((query.cursor as Record<string, unknown>)["id"] !== undefined) {
        const normalizedCursor = query.cursor as Record<string, unknown>;
        cursorIndex = records.findIndex((record) => record.id === normalizedCursor.id);
      }
      if (cursorIndex === -1) {
        records = [];
      } else if (query.take !== undefined && query.take < 0) {
        const skip = query.skip ?? 0;
        const end = cursorIndex + 1 - skip;
        const start = end + query.take;
        records = records.slice(Math.max(0, start), Math.max(0, end));
      } else {
        records = records.slice(cursorIndex);
      }
    }
    if (!(query?.cursor && query?.take !== undefined && query.take < 0)) {
      if (query?.skip !== undefined) {
        records = records.slice(query.skip);
      }
      if (query?.take !== undefined) {
        if (query.take < 0) {
          records = records.slice(query.take);
        } else {
          records = records.slice(0, query.take);
        }
      }
    }
    const relationAppliedRecords = (await this._applyRelations(records, tx, query)) as Prisma.Result<
      Prisma.TodoDelegate,
      object,
      "findFirstOrThrow"
    >[];
    const selectClause = query?.select;
    const selectAppliedRecords = this._applySelectClause(relationAppliedRecords, selectClause);
    this._preprocessListFields(selectAppliedRecords);
    return selectAppliedRecords as Prisma.Result<Prisma.TodoDelegate, Q, "findMany">;
  }
  async findFirst<Q extends Prisma.Args<Prisma.TodoDelegate, "findFirst">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
    }
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
    }
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "findFirstOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;

    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findFirst(query, { tx });
    if (!record) {
      throw new Error("Record not found");
    }
    return record;
  }
  async findUnique<Q extends Prisma.Args<Prisma.TodoDelegate, "findUnique">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
    }
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
      query.select
    )[0];
    this._preprocessListFields([recordWithRelations]);
    return recordWithRelations as Prisma.Result<Prisma.TodoDelegate, Q, "findUnique">;
  }
  async findUniqueOrThrow<Q extends Prisma.Args<Prisma.TodoDelegate, "findUniqueOrThrow">>(
    query: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
    }
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "findUniqueOrThrow">> {
    const { tx: txOption } = options ?? {};
    let tx = txOption;

    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readonly");
    const record = await this.findUnique(query, { tx });
    if (!record) {
      throw new Error("Record not found");
    }
    return record;
  }
  async count<Q extends Prisma.Args<Prisma.TodoDelegate, "count">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
    }
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
    }
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
          { tx, silent, addToOutbox }
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
        { tx }
      );
    }
    const record = this._removeNestedCreateData(await this._fillDefaults(query.data, tx));
    const keyPath = await tx.objectStore("Todo").add(record);
    const data = (await tx.objectStore("Todo").get(keyPath))!;
    const recordsWithRelations = this._applySelectClause(
      await this._applyRelations<object>([data], tx, query),
      query.select
    )[0];
    this._preprocessListFields([recordsWithRelations]);
    await this.emit("create", keyPath, undefined, data, { silent, addToOutbox, tx });
    return recordsWithRelations as Prisma.Result<Prisma.TodoDelegate, Q, "create">;
  }
  async createMany<Q extends Prisma.Args<Prisma.TodoDelegate, "createMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    }
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "createMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const storesNeeded: Set<StoreNames<PrismaIDBSchema>> = new Set(["Todo"]);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Todo").add(record);
      await this.emit("create", keyPath, undefined, record, { silent, addToOutbox, tx });
    }
    return { count: createManyData.length };
  }
  async createManyAndReturn<Q extends Prisma.Args<Prisma.TodoDelegate, "createManyAndReturn">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    }
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "createManyAndReturn">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const createManyData = IDBUtils.convertToArray(query.data);
    const records: Prisma.Result<Prisma.TodoDelegate, object, "findMany"> = [];
    const storesNeeded: Set<StoreNames<PrismaIDBSchema>> = new Set(["Todo"]);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    for (const createData of createManyData) {
      const record = this._removeNestedCreateData(await this._fillDefaults(createData, tx));
      const keyPath = await tx.objectStore("Todo").add(record);
      await this.emit("create", keyPath, undefined, record, { silent, addToOutbox, tx });
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
    }
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "delete">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    const storesNeeded = this._getNeededStoresForFind(query);
    this._getNeededStoresForNestedDelete(storesNeeded);
    tx = tx ?? this.client._db.transaction(Array.from(storesNeeded), "readwrite");
    const record = await this.findUnique(query, { tx });
    if (!record) throw new Error("Record not found");
    await tx.objectStore("Todo").delete([record.id]);
    await this.emit("delete", [record.id], undefined, record, { silent, addToOutbox, tx });
    return record;
  }
  async deleteMany<Q extends Prisma.Args<Prisma.TodoDelegate, "deleteMany">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    }
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
    }
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
          { tx, silent, addToOutbox }
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
          { tx, silent, addToOutbox }
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
          { tx, silent, addToOutbox }
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
    await this.emit("update", keyPath, startKeyPath, record, { silent, addToOutbox, tx });
    for (let i = 0; i < startKeyPath.length; i++) {
      if (startKeyPath[i] !== endKeyPath[i]) {
        break;
      }
    }
    const recordWithRelations = (await this.findUnique(
      {
        where: { id: keyPath[0] },
      },
      { tx }
    ))!;
    return recordWithRelations as Prisma.Result<Prisma.TodoDelegate, Q, "update">;
  }
  async updateMany<Q extends Prisma.Args<Prisma.TodoDelegate, "updateMany">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    }
  ): Promise<Prisma.Result<Prisma.TodoDelegate, Q, "updateMany">> {
    const { tx: txOption, silent = false, addToOutbox = true } = options ?? {};
    let tx = txOption;
    tx = tx ?? this.client._db.transaction(Array.from(this._getNeededStoresForFind(query)), "readwrite");
    const records = await this.findMany({ where: query.where }, { tx });
    await Promise.all(
      records.map(async (record) => {
        await this.update({ where: { id: record.id }, data: query.data }, { tx, silent, addToOutbox });
      })
    );
    return { count: records.length };
  }
  async upsert<Q extends Prisma.Args<Prisma.TodoDelegate, "upsert">>(
    query: Q,
    options?: {
      tx?: IDBUtils.ReadwriteTransactionType;
      silent?: boolean;
      addToOutbox?: boolean;
    }
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
      { tx }
    );
    return record as Prisma.Result<Prisma.TodoDelegate, Q, "upsert">;
  }
  async aggregate<Q extends Prisma.Args<Prisma.TodoDelegate, "aggregate">>(
    query?: Q,
    options?: {
      tx?: IDBUtils.TransactionType;
    }
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
