import { test, expect } from '@playwright/test';

// The public landing page: no sign-in.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Landing page', () => {
  test('renders the Jaali hero, sections and CTAs without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('/');
    await expect(page).toHaveTitle(/Bloomgard CRM/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('without re-typing');
    for (const id of ['platform', 'email', 'features', 'pricing', 'faq']) {
      await expect(page.locator(`#${id}`)).toBeAttached();
    }
    await expect(page.getByRole('heading', { name: /The AI drafts\./ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Book a demo/i }).first()).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('every email and feature claim in the feature list is present', async ({ page }) => {
    await page.goto('/');
    for (const text of ['Excel-style grid', 'Import from Excel with column mapping', 'Replies filed against quotes by QN number',
      'Hot, warm and cold by days since contact', 'Replies are drafted, never sent for you']) {
      await expect(page.getByText(text).first()).toBeAttached();
    }
  });

  test('nav anchors scroll to their sections', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name: 'Pricing' }).click();
    await expect(page).toHaveURL(/#pricing$/);
    await expect(page.locator('#pricing')).toBeInViewport({ timeout: 5000 });
  });

  test('theme toggle switches and is remembered', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const root = page.locator('div[data-theme], main').first();
    await page.getByRole('button', { name: /switch to dark theme/i }).click();
    await expect(page.locator('[data-theme="dark"]')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('[data-theme="dark"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /switch to light theme/i })).toBeVisible();
    void root;
  });

  test('dark system preference renders a dark page', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector('[class*="root"]')!).backgroundColor);
    expect(bg).toBe('rgb(11, 14, 26)');
  });

  test('sign-in dialog offers both portals and closes with Escape', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Log in' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Sign in' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: 'Log in' }).first().click();
    await dialog.getByRole('button', { name: /Client portal/ }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await page.getByRole('button', { name: 'Log in' }).first().click();
    await page.getByRole('dialog', { name: 'Sign in' }).getByRole('button', { name: /Bloomgard Suite/ }).click();
    await expect(page).toHaveURL(/\/boss\/login$/);
  });

  test('contact dialog shows support@bloomgard.co, copies it and opens Gmail to that address', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/');
    await page.getByRole('button', { name: /Book a demo/i }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Contact sales' });
    await expect(dialog).toContainText('support@bloomgard.co');
    await dialog.getByRole('button', { name: /Copy email address/ }).click();
    await expect(dialog.getByRole('button', { name: /Copied/ })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('support@bloomgard.co');
    const href = await dialog.getByRole('link', { name: /Open in Gmail/ }).getAttribute('href');
    expect(href).toContain('to=support@bloomgard.co');
    expect(href).toContain('cc=anshag239@gmail.com');
  });

  test('FAQ answers expand', async ({ page }) => {
    await page.goto('/');
    const q = page.getByText('Does the AI send emails on its own?');
    await q.click();
    await expect(page.getByText(/saved as drafts for you to read, edit and send/)).toBeVisible();
  });

  test('the phone layout never scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('the boss sign-in page loads', async ({ page }) => {
    await page.goto('/boss/login');
    await expect(page.locator('input[type="email"], input[type="password"]').first()).toBeVisible();
  });
});
