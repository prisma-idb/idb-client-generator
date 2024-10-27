import { openDB } from "idb";
import type { IDBPDatabase } from "idb";
import type { Prisma } from "@prisma/client";

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
        db.createObjectStore("user", { keyPath: ["id"] });
        db.createObjectStore("account", { keyPath: ["provider", "providerAccountId"] });
        db.createObjectStore("session", { keyPath: ["sessionToken"] });
        db.createObjectStore("verificationToken", { keyPath: ["identifier", "token"] });
      },
    });
    this.user = new IDBUser(this.db);
    this.account = new IDBAccount(this.db);
    this.session = new IDBSession(this.db);
    this.verificationToken = new IDBVerificationToken(this.db);
  }
}

class BaseIDBModelClass {
  db: IDBPDatabase;

  constructor(db: IDBPDatabase) {
    this.db = db;
  }
}

class IDBUser extends BaseIDBModelClass {
  async findFirst(query: Prisma.UserFindFirstArgs) {
    const records = await this.db.getAll("user");
    return records;
  }

  async findMany(query: Prisma.UserFindManyArgs) {
    return await this.db.getAll("user");
  }

  async findUnique(query: Prisma.UserFindUniqueArgs) {
    if (query.where.id) {
      return (await this.db.get("user", [query.where.id])) ?? null;
    }
    throw new Error("@unique index has not been created");
  }

  async create(query: Prisma.UserCreateArgs) {
    await this.db.add("User", query);
  }
}

class IDBAccount extends BaseIDBModelClass {
  async findFirst(query: Prisma.AccountFindFirstArgs) {
    const records = await this.db.getAll("account");
    return records;
  }

  async findMany(query: Prisma.AccountFindManyArgs) {
    return await this.db.getAll("account");
  }

  async findUnique(query: Prisma.AccountFindUniqueArgs) {
    const keyFieldName = "provider_providerAccountId";
    return (await this.db.get("account", Object.values(query.where[keyFieldName]!))) ?? null;
  }

  async create(query: Prisma.AccountCreateArgs) {
    await this.db.add("Account", query);
  }
}

class IDBSession extends BaseIDBModelClass {
  async findFirst(query: Prisma.SessionFindFirstArgs) {
    const records = await this.db.getAll("session");
    return records;
  }

  async findMany(query: Prisma.SessionFindManyArgs) {
    return await this.db.getAll("session");
  }

  async findUnique(query: Prisma.SessionFindUniqueArgs) {
    if (query.where.sessionToken) {
      return (await this.db.get("session", [query.where.sessionToken])) ?? null;
    }
    throw new Error("@unique index has not been created");
  }

  async create(query: Prisma.SessionCreateArgs) {
    await this.db.add("Session", query);
  }
}

class IDBVerificationToken extends BaseIDBModelClass {
  async findFirst(query: Prisma.VerificationTokenFindFirstArgs) {
    const records = await this.db.getAll("verificationToken");
    return records;
  }

  async findMany(query: Prisma.VerificationTokenFindManyArgs) {
    return await this.db.getAll("verificationToken");
  }

  async findUnique(query: Prisma.VerificationTokenFindUniqueArgs) {
    const keyFieldName = "identifier_token";
    return (await this.db.get("verificationToken", Object.values(query.where[keyFieldName]!))) ?? null;
  }

  async create(query: Prisma.VerificationTokenCreateArgs) {
    await this.db.add("VerificationToken", query);
  }
}
