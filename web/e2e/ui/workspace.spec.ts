import { test, expect } from '@playwright/test';
import { openApp, go, VIEWS, pageErrors } from './_app';

test.describe('Workspace shell', () => {
  test('every sidebar view opens without a crash', async ({ page }) => {
    const errors = pageErrors(page);
    await openApp(page);
    for (const v of VIEWS) {
      await go(page, v);
      await expect(page.getByText(/couldn.t load/i)).toHaveCount(0);
    }
    await page.locator('nav').getByText('Bloomgard AI').click();
    await expect(page.getByText(/couldn.t load/i)).toHaveCount(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('each view shows its own heading', async ({ page }) => {
    await openApp(page);
    await go(page, 'Quotes');
    await expect(page.getByRole('heading', { name: 'Quotes' })).toBeVisible();
    await go(page, 'Inbox');
    await expect(page.getByText('INBOX', { exact: true }).or(page.getByText('Inbox', { exact: true }).nth(1))).toBeVisible();
    await go(page, 'Follow ups');
    await expect(page.getByRole('heading', { name: 'Follow ups' })).toBeVisible();
    await go(page, 'Lead Gen');
    await expect(page.getByRole('heading', { name: 'Lead Generation' })).toBeVisible();
    await go(page, 'Settings');
    await expect(page.getByRole('heading', { name: 'Workspace Settings' })).toBeVisible();
  });

  test('settings is a list; each entry opens and returns to the menu', async ({ page }) => {
    const errors = pageErrors(page);
    await openApp(page);
    await go(page, 'Settings');
    const items = ['Your Profile', 'Master Data', 'User Access', 'Field Configurator', 'Email Settings', 'Personalization', 'AI Settings', 'Quote Template'];
    for (const title of items) {
      await expect(page.getByRole('button', { name: new RegExp(`^${title}`) }).first(), `${title} missing from the settings list`).toBeVisible();
    }
    for (const title of items) {
      await page.getByRole('button', { name: new RegExp(`^${title}`) }).first().click();
      await expect(page.getByRole('button', { name: /Back to Menu/ })).toBeVisible();
      await page.getByRole('button', { name: /Back to Menu/ }).click();
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
