import type { DBSchema } from "idb";

export interface PrismaIDBSchema extends DBSchema {
  user: {
    key: number;
    value: {
      id: number;
      email: string;
      name: string;
    };
  };
}
