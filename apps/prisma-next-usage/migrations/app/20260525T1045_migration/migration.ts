import { createIndexOp, createObjectStoreOp } from "@prisma-next-idb/target-idb/migration";
import type { IdbMigration } from "@prisma-next-idb/target-idb/migration";

const migration: IdbMigration = {
  operations: [
    createObjectStoreOp("_prisma_next_marker", { keyPath: "id" }),
    createObjectStoreOp("posts", { keyPath: "id" }),
    createIndexOp("posts", "byAuthorId", { keyPath: "authorId", unique: undefined }),
    createObjectStoreOp("users", { keyPath: "id" }),
    createIndexOp("users", "byEmail", { keyPath: "email", unique: true }),
  ],
};

export default migration;
