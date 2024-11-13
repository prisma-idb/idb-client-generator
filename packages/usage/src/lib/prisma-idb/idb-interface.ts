import type { DBSchema } from "idb";
import * as Prisma from "@prisma/client";

export interface PrismaIDBSchema extends DBSchema {
  Todo: {
    key: [string];
    value: Prisma.Todo;
    indexes: { [s: string]: IDBValidKey };
  };
  User: {
    key: [string];
    value: Prisma.User;
    indexes: { [s: string]: IDBValidKey };
  };
  Account: {
    key: [string, string];
    value: Prisma.Account;
    indexes: { [s: string]: IDBValidKey };
  };
  Session: {
    key: [string];
    value: Prisma.Session;
    indexes: { [s: string]: IDBValidKey };
  };
  VerificationToken: {
    key: [string, string];
    value: Prisma.VerificationToken;
    indexes: { [s: string]: IDBValidKey };
  };
}
