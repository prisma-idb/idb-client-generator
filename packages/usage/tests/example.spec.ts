import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
	await page.goto('/');
});

test('has title and version', async ({ page }) => {
	await expect(page.getByRole('heading')).toContainText('Prisma-IDB usage page');
	await expect(page.getByRole('paragraph')).toContainText('Database version: 1');
});
