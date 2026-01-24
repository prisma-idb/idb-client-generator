import { test } from "../../fixtures";
import { expectQueryToSucceed } from "../../queryRunnerHelper";

test("aggregate_count_NoWhere_ReturnsAllRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "Alice" }, { name: "Bob" }] },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "aggregate",
    query: { _count: true },
  });
});

test("aggregate_count_WhereClause_ReturnsFilteredCount", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createMany",
    query: { data: [{ name: "John" }, { name: "Johnny" }] },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "aggregate",
    query: { _count: true, where: { name: { contains: "John" } } },
  });
});

test("aggregate_sum_CalculatesSum", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "createMany",
    query: {
      data: [
        { id: 1, title: "Post1", numberArr: [1, 2] },
        { id: 2, title: "Post2", numberArr: [3, 4] },
      ],
    },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "aggregate",
    query: { _sum: { id: true } },
  });
});

test("aggregate_minAndMax_CalculatesCorrectValues", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "createMany",
    query: {
      data: [
        { id: 5, name: "User5" },
        { id: 10, name: "User10" },
      ],
    },
  });

  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "aggregate",
    query: { _min: { id: true }, _max: { id: true } },
  });
});

test("aggregate_avg_CalculatesAverage", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "createMany",
    query: {
      data: [
        { id: 10, title: "Avg1" },
        { id: 20, title: "Avg2" },
      ],
    },
  });

  await expectQueryToSucceed({
    page,
    model: "post",
    operation: "aggregate",
    query: { _avg: { id: true } },
  });
});
