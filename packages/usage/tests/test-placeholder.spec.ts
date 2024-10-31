import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder('Enter Task').click();
  await page.getByPlaceholder('Enter Task').fill('finish assignments');
  await page.getByPlaceholder('Enter Task').press('Enter');
  await expect(page.getByPlaceholder('Enter Task')).toHaveValue('finish assignments');
  await expect(page.getByPlaceholder('Enter Task')).toBeVisible();
});