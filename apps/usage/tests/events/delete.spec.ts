import { expect, test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("deleteEvent_DeleteUser_EmitsDeleteEvent", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: { data: { id: 1, name: "John Doe" } },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "delete",
    query: { where: { id: 1 } },
  });

  await expect(page.locator("pre").first()).toContainText(`{ "keyPath": [ 1 ] }`);
});

test("deleteEvent_DeleteManyUsers_EmitsDeleteEvents", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createMany",
    query: {
      data: [
        { id: 1, name: "John Doe" },
        { id: 2, name: "Jane Doe" },
      ],
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "deleteMany",
    query: { where: { id: { in: [1, 2] } } },
  });

  await expect(page.locator("pre").first()).toContainText(`{ "keyPath": [ 2 ] }`);
});
