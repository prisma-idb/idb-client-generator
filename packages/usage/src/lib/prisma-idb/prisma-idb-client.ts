import { openDB } from "idb";
import type { IDBPDatabase } from "idb";
import type { Prisma } from "@prisma/client";
import { filterByWhereClause } from "./utils";

const IDB_VERSION: number = 1;

export class PrismaIDBClient {
  private static instance: PrismaIDBClient;
  db!: IDBPDatabase;
  user!: IDBUser;
  account!: IDBAccount;
  session!: IDBSession;
  verificationToken!: IDBVerificationToken;

  private constructor() {}

  static async getInstance(): Promise<PrismaIDBClient> {
    if (!PrismaIDBClient.instance) {
      PrismaIDBClient.instance = new PrismaIDBClient();
      await PrismaIDBClient.instance.createDatabase();
    }
    return PrismaIDBClient.instance;
  }

  protected async createDatabase() {
    this.db = await openDB("prisma-idb", IDB_VERSION, {
      upgrade(db) {
        const UserStore = db.createObjectStore("user", { keyPath: ["id"] });
        UserStore.createIndex("emailIndex", "email", { unique: true });
        db.createObjectStore("account", { keyPath: ["provider", "providerAccountId"] });
        db.createObjectStore("session", { keyPath: ["sessionToken"] });
        db.createObjectStore("verificationToken", { keyPath: ["identifier", "token"] });
      },
    });
    this.user = new IDBUser(this.db, ["id"]);
    this.account = new IDBAccount(this.db, ["provider", "providerAccountId"]);
    this.session = new IDBSession(this.db, ["sessionToken"]);
    this.verificationToken = new IDBVerificationToken(this.db, ["identifier", "token"]);
  }
}

class BaseIDBModelClass {
  db: IDBPDatabase;
  keyPath: string[];

  constructor(db: IDBPDatabase, keyPath: string[]) {
    this.db = db;
    this.keyPath = keyPath;
  }
}

class IDBUser extends BaseIDBModelClass {
  async findFirst<T extends Prisma.UserFindFirstArgs>(query: T): Promise<Prisma.UserGetPayload<T> | null> {
    const records = filterByWhereClause(
      await this.db.getAll("user"),
      this.keyPath,
      query.where,
    ) as Prisma.UserGetPayload<T>[];
    return records[0] ?? null;
  }

  async findMany<T extends Prisma.UserFindManyArgs>(query: T): Promise<Prisma.UserGetPayload<T>[]> {
    return await this.db.getAll("user");
  }

  async findUnique<T extends Prisma.UserFindUniqueArgs>(query: T): Promise<Prisma.UserGetPayload<T> | null> {
    if (query.where.id) {
      return (await this.db.get("user", [query.where.id])) ?? null;
    }
    if (query.where.email) {
      return (await this.db.getFromIndex("user", "emailIndex", query.where.email)) ?? null;
    }
    throw new Error("No unique field provided in the where clause");
  }

  async create(query: Prisma.UserCreateArgs) {
    await this.db.add("user", query.data);
  }

  async createMany(query: Prisma.UserCreateManyArgs) {
    const tx = this.db.transaction("user", "readwrite");
    const queryData = Array.isArray(query.data) ? query.data : [query.data];
    await Promise.all([...queryData.map((record) => tx.store.add(record)), tx.done]);
  }

  async delete(query: Prisma.UserDeleteArgs) {}

  async deleteMany(query: Prisma.UserDeleteManyArgs) {}
}

class IDBAccount extends BaseIDBModelClass {
  async findFirst<T extends Prisma.AccountFindFirstArgs>(query: T): Promise<Prisma.AccountGetPayload<T> | null> {
    const records = filterByWhereClause(
      await this.db.getAll("account"),
      this.keyPath,
      query.where,
    ) as Prisma.AccountGetPayload<T>[];
    return records[0] ?? null;
  }

  async findMany<T extends Prisma.AccountFindManyArgs>(query: T): Promise<Prisma.AccountGetPayload<T>[]> {
    return await this.db.getAll("account");
  }

  async findUnique<T extends Prisma.AccountFindUniqueArgs>(query: T): Promise<Prisma.AccountGetPayload<T> | null> {
    const keyFieldName = "provider_providerAccountId";
    return (await this.db.get("account", Object.values(query.where[keyFieldName]!))) ?? null;
  }

  async create(query: Prisma.AccountCreateArgs) {
    await this.db.add("account", query.data);
  }

  async createMany(query: Prisma.AccountCreateManyArgs) {
    const tx = this.db.transaction("account", "readwrite");
    const queryData = Array.isArray(query.data) ? query.data : [query.data];
    await Promise.all([...queryData.map((record) => tx.store.add(record)), tx.done]);
  }

  async delete(query: Prisma.AccountDeleteArgs) {}

  async deleteMany(query: Prisma.AccountDeleteManyArgs) {}
}

class IDBSession extends BaseIDBModelClass {
  async findFirst<T extends Prisma.SessionFindFirstArgs>(query: T): Promise<Prisma.SessionGetPayload<T> | null> {
    const records = filterByWhereClause(
      await this.db.getAll("session"),
      this.keyPath,
      query.where,
    ) as Prisma.SessionGetPayload<T>[];
    return records[0] ?? null;
  }

  async findMany<T extends Prisma.SessionFindManyArgs>(query: T): Promise<Prisma.SessionGetPayload<T>[]> {
    return await this.db.getAll("session");
  }

  async findUnique<T extends Prisma.SessionFindUniqueArgs>(query: T): Promise<Prisma.SessionGetPayload<T> | null> {
    if (query.where.sessionToken) {
      return (await this.db.get("session", [query.where.sessionToken])) ?? null;
    }
    throw new Error("No unique field provided in the where clause");
  }

  async create(query: Prisma.SessionCreateArgs) {
    await this.db.add("session", query.data);
  }

  async createMany(query: Prisma.SessionCreateManyArgs) {
    const tx = this.db.transaction("session", "readwrite");
    const queryData = Array.isArray(query.data) ? query.data : [query.data];
    await Promise.all([...queryData.map((record) => tx.store.add(record)), tx.done]);
  }

  async delete(query: Prisma.SessionDeleteArgs) {}

  async deleteMany(query: Prisma.SessionDeleteManyArgs) {}
}

class IDBVerificationToken extends BaseIDBModelClass {
  async findFirst<T extends Prisma.VerificationTokenFindFirstArgs>(
    query: T,
  ): Promise<Prisma.VerificationTokenGetPayload<T> | null> {
    const records = filterByWhereClause(
      await this.db.getAll("verificationToken"),
      this.keyPath,
      query.where,
    ) as Prisma.VerificationTokenGetPayload<T>[];
    return records[0] ?? null;
  }

  async findMany<T extends Prisma.VerificationTokenFindManyArgs>(
    query: T,
  ): Promise<Prisma.VerificationTokenGetPayload<T>[]> {
    return await this.db.getAll("verificationToken");
  }

  async findUnique<T extends Prisma.VerificationTokenFindUniqueArgs>(
    query: T,
  ): Promise<Prisma.VerificationTokenGetPayload<T> | null> {
    const keyFieldName = "identifier_token";
    return (await this.db.get("verificationToken", Object.values(query.where[keyFieldName]!))) ?? null;
  }

  async create(query: Prisma.VerificationTokenCreateArgs) {
    await this.db.add("verificationToken", query.data);
  }

  async createMany(query: Prisma.VerificationTokenCreateManyArgs) {
    const tx = this.db.transaction("verificationToken", "readwrite");
    const queryData = Array.isArray(query.data) ? query.data : [query.data];
    await Promise.all([...queryData.map((record) => tx.store.add(record)), tx.done]);
  }

  async delete(query: Prisma.VerificationTokenDeleteArgs) {}

  async deleteMany(query: Prisma.VerificationTokenDeleteManyArgs) {}
}
