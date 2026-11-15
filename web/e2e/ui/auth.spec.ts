import { test, expect } from '@playwright/test';
import { ENV } from '../helpers/env';

test.describe('Sign in', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('a wrong password shows an error and stays on the login page', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(ENV.email);
    await page.locator('input[type="password"]').fill('definitely-not-the-password');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid login credentials/i)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('the dashboard bounces visitors who are not signed in', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForURL((u) => !u.pathname.startsWith('/dashboard'), { timeout: 20_000 });
  });

  test('valid credentials open the workspace and Sign Out leaves it', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill(ENV.email);
    await page.locator('input[type="password"]').fill(ENV.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 40_000 });
    await expect(page.getByText('Initializing Workspace...')).toBeHidden({ timeout: 45_000 });
    await expect(page.locator('nav').getByText('Follow ups', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign Out' }).click();
    await page.waitForURL((u) => !u.pathname.startsWith('/dashboard'), { timeout: 20_000 });
  });
});

test('signing out on one device leaves the other devices signed in', async ({ browser }) => {
  test.setTimeout(120_000);
  const { openAppFresh } = await import('./_app');
  const a = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const b = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const pa = await a.newPage(); const pb = await b.newPage();
  await openAppFresh(pa);
  await openAppFresh(pb);
  await pa.getByRole('button', { name: 'Sign Out' }).click();
  await expect(pa).not.toHaveURL(/\/dashboard/, { timeout: 20_000 }); // back to the public site
  // device B still works end to end, including the server-checked AI home
  await pb.reload();
  await expect(pb.getByText(/Could not load stats/)).toHaveCount(0);
  await expect(pb.getByLabel('Pipeline statistics').locator('.agent-num').first()).toHaveText(/^\d+$/, { timeout: 30_000 });
  await a.close(); await b.close();
});

test('Create account: a new workspace from the sign-up form, signed straight in as its admin', async ({ browser }) => {
  test.setTimeout(120_000);
  const { admin } = await import('../helpers/db');
  const tag = `e2e${Date.now().toString(36)}`;
  const email = `e2e-ui-signup-${tag}@e2e-signup.test`;
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await ctx.newPage();
  try {
    await page.goto('/signup');
    await expect(page).toHaveURL(/mode=signup/);
    await page.getByPlaceholder('Acme Steel Pvt. Ltd.').fill(`E2E UI Signup ${tag}`);
    await page.getByPlaceholder('Priya Sharma').fill('UI Tester');
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill('kora-neel-12345');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByText('ADMIN', { exact: true }).or(page.getByText('admin', { exact: true })).first()).toBeVisible({ timeout: 45_000 });
  } finally {
    const { data: prof } = await admin().from('profiles').select('id, tenant_id').eq('email', email).maybeSingle();
    if (prof) {
      await admin().from('profiles').delete().eq('id', prof.id);
      await admin().auth.admin.deleteUser(prof.id).catch(() => {});
      await admin().from('tenant_schemas').delete().eq('tenant_id', prof.tenant_id);
      await admin().from('tenants').delete().eq('id', prof.tenant_id);
    }
    await ctx.close();
  }
});
