import type { FamilyPackRef } from "@prisma-next/framework-components/components";

const idbFamilyPack = {
  kind: "family",
  id: "idb",
  familyId: "idb",
  version: "0.0.1",
} as const satisfies FamilyPackRef<"idb">;

export default idbFamilyPack;
