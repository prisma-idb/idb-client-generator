import type { DBSchema } from "idb";
import * as Prisma from "@prisma/client";

export interface PrismaIDBSchema extends DBSchema {
  User: {
    key: [string];
    value: Prisma.User;
    indexes: { [s: string]: IDBValidKey };
  };
  Todo: {
    key: [string];
    value: Prisma.Todo;
    indexes: { [s: string]: IDBValidKey };
  };
}
