import * as Prisma from "@prisma/client";
import type { DBSchema } from "idb";

export interface PrismaIDBSchema extends DBSchema {
  User: {
    key: [id: Prisma.User["id"]];
    value: Prisma.User;
  };
  Todo: {
    key: [id: Prisma.Todo["id"]];
    value: Prisma.Todo;
  };
}
