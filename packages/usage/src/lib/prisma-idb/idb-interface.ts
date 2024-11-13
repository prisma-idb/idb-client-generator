import * as Prisma from "@prisma/client";
import type { DBSchema } from "idb";

export interface PrismaIDBSchema extends DBSchema {
  User: {
    key: [userId: Prisma.User["userId"]];
    value: Prisma.User;
  };
  Todo: {
    key: [todoId: Prisma.Todo["todoId"]];
    value: Prisma.Todo;
  };
}
