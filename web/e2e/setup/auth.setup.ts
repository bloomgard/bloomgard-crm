import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import { ENV } from '../helpers/env';

const AUTH_FILE = 'e2e/.auth/user.json';

/** Sign in once as the E2E account (E2E_EMAIL / E2E_PASSWORD in web/.env.local) and save the session. */
setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  const emailInput = page.locator('input[type="email"]');
  await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
  await emailInput.fill(ENV.email);
  await page.locator('input[type="password"]').fill(ENV.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/(dashboard|boss)/, { timeout: 40_000 });
  await expect(page).not.toHaveURL(/\/login/);
  fs.mkdirSync('e2e/.auth', { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
