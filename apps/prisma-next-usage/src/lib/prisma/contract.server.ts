import { defineContract } from "@prisma-next-idb/family-idb/contract-ts";
import idbFamilyPack from "@prisma-next-idb/family-idb/pack";
import idbTargetPack from "@prisma-next-idb/target-idb/pack";

export const contract = defineContract({
  family: idbFamilyPack,
  target: idbTargetPack,
  models: {
    User: {
      store: "users",
      key: "id",
      indexes: { byEmail: { keyPath: "email", unique: true } },
    },
    Post: {
      store: "posts",
      key: "id",
      indexes: { byAuthorId: { keyPath: "authorId", unique: false } },
      relations: {
        author: { to: "User", cardinality: "N:1", on: { local: ["authorId"], target: ["id"] } },
      },
    },
  },
});
