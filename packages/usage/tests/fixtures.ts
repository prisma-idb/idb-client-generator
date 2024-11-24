import { prisma } from "$lib/prisma";
import { test as base } from "@playwright/test";

async function resetDatabase() {
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$executeRaw`ALTER SEQUENCE "User_id_seq" RESTART WITH 1`;
  await prisma.$executeRaw`ALTER SEQUENCE "Profile_id_seq" RESTART WITH 1`;
  await prisma.$executeRaw`ALTER SEQUENCE "Post_id_seq" RESTART WITH 1`;
}

export const test = base.extend<{ prepareTest: void }>({
  prepareTest: [
    async ({ page }, use) => {
      await resetDatabase();
      await page.goto("/");
      await use();
    },
    { auto: true },
  ],
});
export { expect } from "@playwright/test";
