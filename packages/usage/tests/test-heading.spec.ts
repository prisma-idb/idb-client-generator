import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Prisma-IDB usage page' }).dblclick();
});