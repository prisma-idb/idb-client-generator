import type { DBSchema } from "idb";

export const UserType = {
  ADMIN: "ADMIN",
  USER: "USER",
} as const;

export const Stats = {
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
} as const;

export interface PrismaIDBSchema extends DBSchema {
  user: {
    key: number;
    value: {
      id: number;
      email: string;
      name: string;
      type: (typeof UserType)[keyof typeof UserType];
    };
  };
}
