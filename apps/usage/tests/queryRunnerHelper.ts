import type { Prisma, PrismaClient } from "$lib/generated/prisma/client";
import { expect, type Page } from "@playwright/test";
import type { Operation } from "@prisma/client/runtime/client";

type Model = Exclude<keyof PrismaClient, `$${string}` | symbol>;
type Op = Exclude<Operation, "findRaw" | "aggregateRaw" | `$${string}`>;
type QueryParams<M extends Model, F extends Op> = {
  page: Page;
  prisma: PrismaClient;
  model: M;
  operation: F;
  query?: Prisma.Args<PrismaClient[M], F>;
};

async function submitQuery(page: Page, model: string, operation: string, query: unknown) {
  await page.getByTestId("query-input").fill(`${model}.${operation}(${JSON.stringify(query)})`);
  await page.getByRole("button", { name: "Run query" }).click();
}

export async function runQuery<M extends Model, F extends Op>(params: QueryParams<M, F>) {
  const { page, prisma, model, operation, query } = params;

  const operationFunction = prisma[model][operation] as (...args: unknown[]) => unknown;
  const prismaClientResult = await operationFunction(query);

  await submitQuery(page, model, operation, query);
  await expect(page.getByRole("button", { name: "Run query" })).not.toBeDisabled();
  const textContent = await page.getByRole("code").last().textContent();
  expect(textContent, "Expected query result element to have text content").not.toBeNull();
  const idbClientResult = JSON.parse(textContent!);

  return { idbClientResult, prismaClientResult };
}

export async function expectQueryToSucceed<M extends Model, F extends Op>(params: QueryParams<M, F>) {
  const { idbClientResult, prismaClientResult } = await runQuery(params);
  expect(idbClientResult).toEqual(JSON.parse(JSON.stringify(prismaClientResult)));
  return prismaClientResult;
}

export async function expectQueryToFail<M extends Model, F extends Op>(
  params: QueryParams<M, F> & { errorMessage: string; expectPrismaToAlsoFail?: boolean }
) {
  const { page, prisma, model, operation, query, errorMessage, expectPrismaToAlsoFail = true } = params;

  const operationFunction = prisma[model][operation] as (...args: unknown[]) => unknown;
  if (expectPrismaToAlsoFail) {
    await expect(operationFunction(query)).rejects.toThrowError();
  }

  await submitQuery(page, model, operation, query);
  await expect(page.getByRole("listitem").first()).toContainText(errorMessage);
}
