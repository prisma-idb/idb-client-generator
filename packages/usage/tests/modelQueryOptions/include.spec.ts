import { test } from "../fixtures";
import { expectQueryToSucceed } from "../queryRunnerHelper";

test("include_WithOneToOneRelation_ReturnsRelatedData", async ({ page }) => {
  await expectQueryToSucceed({
    page,
    model: "user",
    operation: "create",
    query: {
      data: { name: "John Doe", profile: { create: { bio: "John's Bio" } } },
    },
  });
  await expectQueryToSucceed({ page, model: "user", operation: "findMany", query: { include: { profile: true } } });
});

// TODO: test for other relation types (one-to-many, one-to-oneMetaOnCurrent, nested includes)
