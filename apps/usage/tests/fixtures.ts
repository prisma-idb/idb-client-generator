import { PrismaClient } from "$lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { test as base } from "@playwright/test";
import "dotenv/config";

async function resetDatabase(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE 
      "Child", 
      "Father", 
      "Mother", 
      "Comment", 
      "Post", 
      "UserGroup", 
      "Group", 
      "User",
      "CompositeIdIntString",
      "CompositeIdWithDateTime",
      "TripleCompositeIdWithDate",
      "CompositeUniqueWithDateTime",
      "CompositeUniqueFloatInt",
      "MultipleCompositeUniques",
      "ModelWithIndex",
      "ModelWithUniqueAttributes",
      "ModelWithOptionalRelationToUniqueAttributes",
      "Profile",
      "TestUuid",
      "ModelWithEnum"
      RESTART IDENTITY CASCADE;`);
}

export const test = base.extend<{ prepareTest: void }, { prisma: PrismaClient }>({
  prisma: [
    // eslint-disable-next-line no-empty-pattern
    async ({}, use, workerInfo) => {
      const url = new URL(process.env.DATABASE_URL!);
      const baseName = url.pathname.slice(1);
      url.pathname = `/${baseName}_worker_${workerInfo.workerIndex}`;
      const prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.toString() }),
      });
      await use(prisma);
      await prisma.$disconnect();
    },
    { scope: "worker" },
  ],
  prepareTest: [
    async ({ page, prisma }, use) => {
      await resetDatabase(prisma);
      await page.goto("/");
      await use();
    },
    { auto: true },
  ],
});
export { expect } from "@playwright/test";
