import type { DBSchema } from "idb";
import * as Prisma from "@prisma/client";

export interface PrismaIDBSchema extends DBSchema {
  Todo: {
    key: [string];
    value: Prisma.Todo;
  };
}
