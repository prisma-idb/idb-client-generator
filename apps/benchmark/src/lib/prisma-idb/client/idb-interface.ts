import type { DBSchema } from "idb";
import type * as Prisma from "../../generated/prisma/client";

export interface PrismaIDBSchema extends DBSchema {
  User: {
    key: [id: Prisma.User["id"]];
    value: Prisma.User;
  };
  Todo: {
    key: [id: Prisma.Todo["id"]];
    value: Prisma.Todo;
    indexes: {
      userIdIndex: [userId: Prisma.Todo["userId"]];
    };
  };
}
