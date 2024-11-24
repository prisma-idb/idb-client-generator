import { prisma } from "$lib/prisma";
import { expect, type Page } from "@playwright/test";
import type { Prisma } from "@prisma/client";
import type { Operation } from "@prisma/client/runtime/library";

export async function expectQueryToSucceed<
  M extends Exclude<keyof typeof prisma, `$${string}` | symbol>,
  F extends Exclude<Operation, "findRaw" | "aggregateRaw" | `$${string}`>,
>(params: { page: Page; model: M; operation: F; query?: Prisma.Args<(typeof prisma)[M], F> }) {
  const { page, model, operation, query } = params;

  const operationFunction = prisma[model][operation] as (...args: unknown[]) => unknown;
  const prismaClientResult = await operationFunction(query);

  await page.getByTestId("query-input").fill(`${model}.${operation}(${JSON.stringify(query)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").last()).toContainText("Query executed successfully");

  const idbClientResult = (await page.getByRole("code").textContent()) ?? "";
  expect(JSON.parse(idbClientResult)).toEqual(prismaClientResult);
}

export async function expectQueryToFail<
  M extends Exclude<keyof typeof prisma, `$${string}` | symbol>,
  F extends Exclude<Operation, "findRaw" | "aggregateRaw" | `$${string}`>,
>(params: { page: Page; model: M; operation: F; query?: Prisma.Args<(typeof prisma)[M], F>; errorMessage: string }) {
  const { page, model, operation, query, errorMessage } = params;

  const operationFunction = prisma[model][operation] as (...args: unknown[]) => unknown;
  await expect(operationFunction).rejects.toThrowError();

  await page.getByTestId("query-input").fill(`${model}.${operation}(${JSON.stringify(query)})`);
  await page.getByRole("button", { name: "Run query" }).click();
  await expect(page.getByRole("status").last()).toContainText(errorMessage);
}
