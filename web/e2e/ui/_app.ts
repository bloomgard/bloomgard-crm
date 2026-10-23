import { Page, expect } from '@playwright/test';

export const VIEWS = ['Dashboard', 'Quotes', 'Inbox', 'Follow ups', 'Lead Gen', 'Docs', 'Settings'] as const;

/** Open the dashboard and wait for the workspace to finish initialising. */
export async function openApp(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByText('Initializing Workspace...')).toBeHidden({ timeout: 45_000 });
  await expect(page.locator('nav').getByText('Follow ups', { exact: true })).toBeVisible();
}

export async function go(page: Page, view: string) {
  await page.locator('nav').getByText(view, { exact: true }).first().click();
  await page.waitForTimeout(600);
}

export async function openSetting(page: Page, title: string) {
  await go(page, 'Settings');
  const back = page.getByRole('button', { name: /Back to Menu/ });
  if (await back.isVisible().catch(() => false)) await back.click();
  await page.getByRole('button', { name: new RegExp(`^${title}`) }).first().click();
}

/** Accept every alert/confirm and remember what they said. */
export function captureDialogs(page: Page) {
  const messages: string[] = [];
  page.on('dialog', async (d) => { messages.push(d.message()); await d.accept(); });
  return messages;
}

/** Collect uncaught page errors so a test can assert the page never crashed. */
export function pageErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
