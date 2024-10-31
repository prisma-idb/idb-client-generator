import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:5173/');
  await page.getByPlaceholder('Enter Task').click();
  await page.getByPlaceholder('Enter Task').fill('finish assignments');
});