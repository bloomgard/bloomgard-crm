import { Page, expect } from '@playwright/test';
import { ENV } from '../helpers/env';

export const VIEWS = ['Home', 'Quotes', 'Inbox', 'Follow ups', 'Lead Gen', 'Docs', 'Settings'] as const;

/** Open the dashboard and wait for the workspace to finish initialising. */
export async function openApp(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByText('Initializing Workspace...')).toBeHidden({ timeout: 45_000 });
  await expect(page.locator('nav').getByText('Follow ups', { exact: true })).toBeVisible();
}

/**
 * Sign in with a brand-new session. Use it for anything that calls the server with the user's token
 * (the AI agent): the saved storage state can be revoked by the Sign Out test, which signs out globally.
 */
export async function openAppFresh(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(ENV.email);
  await page.locator('input[type="password"]').fill(ENV.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 40_000 });
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
