import { test, expect } from './fixtures';

test('basic flow', async ({ page }) => {
	await page.goto('http://localhost:5173/');
	await page.getByRole('textbox', { name: 'User name' }).click();
	await page.getByRole('textbox', { name: 'User name' }).fill('Yash');
	await page.getByRole('textbox', { name: 'User name' }).press('Tab');
	await page.getByRole('button', { name: 'Create' }).click();
	await page.getByRole('tab', { name: 'Users' }).click();
	await page.getByRole('button', { name: 'Choose user' }).click();
	await page.getByRole('option', { name: 'Yash' }).click();

	await page.getByRole('tab', { name: 'Todos' }).click();
	await page.getByRole('textbox', { name: 'What needs to be done?' }).click();
	await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('y1');
	await page.getByRole('textbox', { name: 'What needs to be done?' }).press('Tab');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.getByText('Todos for Yash y1')).toBeVisible();

	await page.getByRole('tab', { name: 'Sync' }).click();
	await expect(page.getByTestId('sync-total-count')).toContainText('2');
	await page.getByTestId('start-sync-button').click();
	await expect(page.getByRole('listitem').first()).toContainText(
		'Sync started! Processing outbox events...'
	);

	let syncComplete = false;
	while (!syncComplete) {
		await page.getByTestId('refresh-stats-button').click();
		try {
			await expect(page.getByTestId('sync-total-count')).toHaveText('0', { timeout: 1000 });
			syncComplete = true;
		} catch {
			await page.waitForTimeout(500);
		}
	}

	await page.getByTestId('clear-database-button').click();
	// Wait for database clear and state refresh
	await expect(page.getByTestId('sync-total-count')).toHaveText('0', { timeout: 5000 });

	await page.getByRole('tab', { name: 'Pull' }).click();
	await page.getByTestId('fetch-changes-button').click();
	// Wait for pull to complete and state to refresh
	await page.waitForTimeout(2000);

	await page.getByRole('tab', { name: 'Users' }).click();
	await page.getByRole('button', { name: 'Choose user' }).click();
	await page.getByRole('option', { name: 'Yash' }).click();
	await page.getByRole('tab', { name: 'Todos' }).click();
	await expect(page.getByText('Todos for Yash y1')).toBeVisible();
});

test('delete propagation', async ({ page }) => {
	await page.goto('http://localhost:5173/');
	await page.getByRole('textbox', { name: 'User name' }).click();
	await page.getByRole('textbox', { name: 'User name' }).fill('DeleteTest');
	await page.getByRole('textbox', { name: 'User name' }).press('Tab');
	await page.getByRole('button', { name: 'Create' }).click();
	await page.getByRole('tab', { name: 'Users' }).click();
	await page.getByRole('button', { name: 'Choose user' }).click();
	await page.getByRole('option', { name: 'DeleteTest' }).click();

	await page.getByRole('tab', { name: 'Todos' }).click();
	// Create 3 todos
	await page.getByRole('textbox', { name: 'What needs to be done?' }).click();
	await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('todo-1');
	await page.getByRole('textbox', { name: 'What needs to be done?' }).press('Tab');
	await page.getByRole('button', { name: 'Add' }).click();

	await page.getByRole('textbox', { name: 'What needs to be done?' }).click();
	await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('delete-me');
	await page.getByRole('textbox', { name: 'What needs to be done?' }).press('Tab');
	await page.getByRole('button', { name: 'Add' }).click();

	await page.getByRole('textbox', { name: 'What needs to be done?' }).click();
	await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('todo-3');
	await page.getByRole('textbox', { name: 'What needs to be done?' }).press('Tab');
	await page.getByRole('button', { name: 'Add' }).click();

	// Sync after create
	await page.getByRole('tab', { name: 'Sync' }).click();
	await page.getByTestId('start-sync-button').click();
	await expect(page.getByRole('listitem').first()).toContainText(
		'Sync started! Processing outbox events...'
	);

	let syncComplete = false;
	while (!syncComplete) {
		await page.getByTestId('refresh-stats-button').click();
		try {
			await expect(page.getByTestId('sync-total-count')).toHaveText('0', { timeout: 1000 });
			syncComplete = true;
		} catch {
			await page.waitForTimeout(500);
		}
	}

	// Delete the middle todo locally
	await page.getByRole('tab', { name: 'Todos' }).click();
	await page.getByTestId('delete-todo-delete-me').click();
	await expect(page.locator('text=Todos for DeleteTest todo-1 todo-3')).toBeVisible();

	// Sync after delete
	await page.getByRole('tab', { name: 'Sync' }).click();

	syncComplete = false;
	while (!syncComplete) {
		await page.getByTestId('refresh-stats-button').click();
		try {
			await expect(page.getByTestId('sync-total-count')).toHaveText('0', { timeout: 1000 });
			syncComplete = true;
		} catch {
			await page.waitForTimeout(500);
		}
	}

	// Reset local database
	await page.getByTestId('clear-database-button').click();
	await expect(page.getByTestId('sync-total-count')).toHaveText('0', { timeout: 5000 });

	// Pull data from remote
	await page.getByRole('tab', { name: 'Pull' }).click();
	await page.getByTestId('fetch-changes-button').click();
	await page.waitForTimeout(2000);

	// Assert todo is gone (should not resurrect)
	await page.getByRole('tab', { name: 'Users' }).click();
	await page.getByRole('button', { name: 'Choose user' }).click();
	await page.getByRole('option', { name: 'DeleteTest' }).click();
	await page.getByRole('tab', { name: 'Todos' }).click();
	await expect(page.getByText('delete-me')).not.toBeVisible();
});

test('update after create (ordering)', async ({ page }) => {
	await page.goto('http://localhost:5173/');
	await page.getByRole('textbox', { name: 'User name' }).click();
	await page.getByRole('textbox', { name: 'User name' }).fill('UpdateTest');
	await page.getByRole('textbox', { name: 'User name' }).press('Tab');
	await page.getByRole('button', { name: 'Create' }).click();
	await page.getByRole('tab', { name: 'Users' }).click();
	await page.getByRole('button', { name: 'Choose user' }).click();
	await page.getByRole('option', { name: 'UpdateTest' }).click();

	await page.getByRole('tab', { name: 'Todos' }).click();
	// Create todo
	await page.getByRole('textbox', { name: 'What needs to be done?' }).click();
	await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('todo-to-complete');
	await page.getByRole('textbox', { name: 'What needs to be done?' }).press('Tab');
	await page.getByRole('button', { name: 'Add' }).click();
	await expect(page.locator('text=todo-to-complete')).toBeVisible();

	// Mark as complete before syncing
	await page.getByTestId('mark-as-incomplete-todo-to-complete').click();
	await expect(page.getByTestId('mark-as-complete-todo-to-complete')).toBeVisible();

	// Sync
	await page.getByRole('tab', { name: 'Sync' }).click();
	await page.getByTestId('start-sync-button').click();
	await expect(page.getByRole('listitem').first()).toContainText(
		'Sync started! Processing outbox events...'
	);

	let syncComplete = false;
	while (!syncComplete) {
		await page.getByTestId('refresh-stats-button').click();
		try {
			await expect(page.getByTestId('sync-total-count')).toHaveText('0', { timeout: 1000 });
			syncComplete = true;
		} catch {
			await page.waitForTimeout(500);
		}
	}

	// Reset local database
	await page.getByTestId('clear-database-button').click();
	await expect(page.getByTestId('sync-total-count')).toHaveText('0', { timeout: 5000 });

	// Pull data from remote
	await page.getByRole('tab', { name: 'Pull' }).click();
	await page.getByTestId('fetch-changes-button').click();
	await page.waitForTimeout(2000);

	// Assert todo is marked as complete
	await page.getByRole('tab', { name: 'Users' }).click();
	await page.getByRole('button', { name: 'Choose user' }).click();
	await page.getByRole('option', { name: 'UpdateTest' }).click();
	await page.getByRole('tab', { name: 'Todos' }).click();
	await expect(page.getByTestId('mark-as-complete-todo-to-complete')).toBeVisible();
});

test('retry / idempotency (resilience)', async ({ page }) => {
	await page.goto('http://localhost:5173/');
	await page.getByRole('textbox', { name: 'User name' }).click();
	await page.getByRole('textbox', { name: 'User name' }).fill('IdempotencyTest');
	await page.getByRole('textbox', { name: 'User name' }).press('Tab');
	await page.getByRole('button', { name: 'Create' }).click();
	await page.getByRole('tab', { name: 'Users' }).click();
	await page.getByRole('button', { name: 'Choose user' }).click();
	await page.getByRole('option', { name: 'IdempotencyTest' }).click();

	await page.getByRole('tab', { name: 'Todos' }).click();
	// Create 2 todos
	await page.getByRole('textbox', { name: 'What needs to be done?' }).click();
	await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('idempotent-1');
	await page.getByRole('textbox', { name: 'What needs to be done?' }).press('Tab');
	await page.getByRole('button', { name: 'Add' }).click();

	await page.getByRole('textbox', { name: 'What needs to be done?' }).click();
	await page.getByRole('textbox', { name: 'What needs to be done?' }).fill('idempotent-2');
	await page.getByRole('textbox', { name: 'What needs to be done?' }).press('Tab');
	await page.getByRole('button', { name: 'Add' }).click();

	await expect(page.locator('text=IdempotencyTest idempotent-1 idempotent-2')).toBeVisible();

	// Start sync
	await page.getByRole('tab', { name: 'Sync' }).click();
	await page.getByTestId('start-sync-button').click();
	await expect(page.getByRole('listitem').first()).toContainText(
		'Sync started! Processing outbox events...'
	);

	// Wait for sync to complete
	let syncComplete = false;
	while (!syncComplete) {
		await page.getByTestId('refresh-stats-button').click();
		try {
			await expect(page.getByTestId('sync-total-count')).toHaveText('0', { timeout: 1000 });
			syncComplete = true;
		} catch {
			await page.waitForTimeout(500);
		}
	}

	// Stop sync and start again (second sync for idempotency check)
	await page.getByTestId('stop-sync-button').click();
	await page.getByTestId('start-sync-button').click();
	await expect(page.getByRole('listitem').first()).toContainText(
		'Sync started! Processing outbox events...'
	);

	syncComplete = false;
	while (!syncComplete) {
		await page.getByTestId('refresh-stats-button').click();
		try {
			await expect(page.getByTestId('sync-total-count')).toHaveText('0', { timeout: 1000 });
			syncComplete = true;
		} catch {
			await page.waitForTimeout(500);
		}
	}

	// Ensure no duplicates and stats remain correct
	await page.getByRole('tab', { name: 'Todos' }).click();
	await expect(page.locator('text=IdempotencyTest idempotent-1 idempotent-2')).toBeVisible();
	await page.getByRole('tab', { name: 'Users' }).click();
	await page.getByRole('button', { name: 'Choose user' }).click();
	await page.getByRole('option', { name: 'IdempotencyTest' }).click();
	await page.getByRole('tab', { name: 'Todos' }).click();
	await expect(page.getByRole('button', { name: 'Delete todo' })).toHaveCount(2);
});
