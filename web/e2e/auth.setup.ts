import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';

const AUTH_FILE = 'e2e/.auth/user.json';

/**
 * Logs in once with the credentials in E2E_EMAIL / E2E_PASSWORD (put them in
 * web/.env.local) and saves the session so the walkthrough specs skip login.
 */
setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'Set E2E_EMAIL and E2E_PASSWORD in web/.env.local (a Sales Manager account works best).'
    );
  }

  await page.goto('/login');
  // The page shows a "Checking Session..." splash before the form mounts.
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
  await emailInput.fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();

  // super_admin lands on /boss, everyone else on /dashboard
  await page.waitForURL(/\/(dashboard|boss)/, { timeout: 40_000 });
  await expect(page).not.toHaveURL(/\/login/);

  fs.mkdirSync('e2e/.auth', { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
