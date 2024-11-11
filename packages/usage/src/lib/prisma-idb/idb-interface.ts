import type { DBSchema } from "idb";

export interface PrismaIDBSchema extends DBSchema {
  Todo: {
    key: ["string"];
    value: {
      id: string;
      task: string;
      isCompleted: boolean;
    };
  };
}
