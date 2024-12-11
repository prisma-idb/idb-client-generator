import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("@@id_CreateRecordWithCompositeKey_SuccessfullyCreatesRecord", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "mother",
    operation: "create",
    query: { data: { firstName: "Alice", lastName: "Doe" } },
  });
  await expectQueryToSucceed({ page, model: "mother", operation: "findMany" });
});

test("@@id_CreateRelatedRecords_SuccessfullyCreatesRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "mother",
    operation: "create",
    query: { data: { firstName: "Alice", lastName: "Doe" } },
  });
  await expectQueryToSucceed({ page, model: "mother", operation: "findMany" });

  await expectQueryToSucceed({
    page,
    model: "father",
    operation: "create",
    query: {
      data: {
        firstName: "John",
        lastName: "Doe",
        wife: { connect: { firstName_lastName: { firstName: "Alice", lastName: "Doe" } } },
      },
    },
  });

  await expectQueryToSucceed({ page, model: "father", operation: "findMany", query: { include: { wife: true } } });
  await expectQueryToSucceed({ page, model: "mother", operation: "findMany", query: { include: { husband: true } } });
});

test("@@id_CreateNestedRecords_SuccessfullyCreatesRecords", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "mother",
    operation: "create",
    query: {
      data: {
        firstName: "Alice",
        lastName: "Doe",
        husband: { create: { firstName: "John", lastName: "Doe" } },
        children: {
          create: { childFirstName: "Robert", childLastName: "Doe", fatherFirstName: "John", fatherLastName: "Doe" },
        },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "father",
    operation: "findMany",
    query: { include: { wife: true, children: true } },
  });
  await expectQueryToSucceed({
    page,
    model: "mother",
    operation: "findMany",
    query: { include: { husband: true, children: true } },
  });
});

test("@@id_CreateFatherAndMotherDuringChildCreation_SuccessfullyRearrangesDeps", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "child",
    operation: "create",
    query: {
      data: {
        childFirstName: "Robert",
        childLastName: "Doe",
        father: {
          create: {
            firstName: "John",
            lastName: "Doe",
            wife: { connect: { firstName_lastName: { firstName: "Alice", lastName: "Doe" } } },
          },
        },
        mother: { create: { firstName: "Alice", lastName: "Doe" } },
      },
    },
  });

  await expectQueryToSucceed({
    page,
    model: "father",
    operation: "findMany",
    query: { include: { wife: true, children: true } },
  });
  await expectQueryToSucceed({
    page,
    model: "mother",
    operation: "findMany",
    query: { include: { husband: true, children: true } },
  });
});
