import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Prisma-IDB usage page' }).dblclick();
  await page.getByRole('heading', { name: 'Prisma-IDB usage page' }).click();
  await expect(page.getByRole('heading')).toContainText('Prisma-IDB usage page');
  await expect(page.getByRole('heading', { name: 'Prisma-IDB usage page' })).toBeVisible();
});