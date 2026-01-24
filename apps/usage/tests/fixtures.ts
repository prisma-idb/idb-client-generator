import { prisma } from "../src/lib/prisma";
import { test as base } from "@playwright/test";

async function resetDatabase() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE 
      "Child", 
      "Father", 
      "Mother", 
      "Comment", 
      "Post", 
      "UserGroup", 
      "Group", 
      "User" 
      RESTART IDENTITY CASCADE;`);
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
