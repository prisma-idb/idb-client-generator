import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {

  await page.goto('http://localhost:5173/');
  await page.getByRole('button', { name: 'Add Task' }).click();
});
