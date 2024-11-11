import type { DBSchema } from "idb";

export interface PrismaIDBSchema extends DBSchema {
  todo: {
    key: ["string"];
    value: {
      id: string;
      task: string;
      isCompleted: boolean;
    };
  };
}
