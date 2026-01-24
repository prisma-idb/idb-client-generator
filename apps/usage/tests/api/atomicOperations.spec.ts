import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("atomicUpdate_Increment_SuccessfullyIncrementsField", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Test Post", views: 1 } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "update",
    query: { where: { id: 1 }, data: { views: { increment: 1 } } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findUnique",
    query: { where: { id: 1 } },
  });
});

test("atomicUpdate_Decrement_SuccessfullyDecrementsField", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Test Post", views: 5 } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "update",
    query: { where: { id: 1 }, data: { views: { decrement: 2 } } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findUnique",
    query: { where: { id: 1 } },
  });
});

test("atomicUpdate_Multiply_SuccessfullyMultipliesField", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Test Post", views: 2 } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "update",
    query: { where: { id: 1 }, data: { views: { multiply: 2 } } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findUnique",
    query: { where: { id: 1 } },
  });
});

test("atomicUpdate_Divide_SuccessfullyDividesField", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Test Post", views: 8 } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "update",
    query: { where: { id: 1 }, data: { views: { divide: 2 } } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findUnique",
    query: { where: { id: 1 } },
  });
});

test("atomicUpdate_Set_SuccessfullySetsField", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "create",
    query: { data: { title: "Test Post", views: 1 } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "update",
    query: { where: { id: 1 }, data: { views: { set: 10 } } },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "findUnique",
    query: { where: { id: 1 } },
  });
});
