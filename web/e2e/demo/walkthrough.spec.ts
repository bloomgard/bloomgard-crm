import { test, expect, Page } from '@playwright/test';

/**
 * Feature walkthrough — one test per scene, each recorded to its own video
 * under test-results/. Read-only by design: nothing here sends an email or
 * creates a quote. Steps that would mutate live data are left commented with
 * a NOTE so you can enable them against a throwaway workspace.
 *
 * Run:  npx playwright test walkthrough        (spins up npm run dev)
 * Videos: test-results/<scene>/video.webm  ·  report: npx playwright show-report
 */

const boot = async (page: Page) => {
  await page.goto('/dashboard');
  await expect(page.getByText('Initializing Workspace...')).toBeHidden({ timeout: 45_000 });
};

const nav = async (page: Page, label: string) => {
  await page.locator('nav').getByText(label, { exact: true }).first().click();
  await page.waitForTimeout(800);
};

const openSetting = async (page: Page, title: string) => {
  await nav(page, 'Settings');
  await page.getByRole('button', { name: new RegExp(title, 'i') }).first().click();
  await page.waitForTimeout(1000);
};

test.beforeEach(async ({ page }) => {
  await boot(page);
});

test('scene 01 — Master Data grid', async ({ page }) => {
  await openSetting(page, 'Master Data');
  await expect(page.getByText(/Manual Data|Import Excel/i).first()).toBeVisible();
  await page.waitForTimeout(2500); // let the reviewer read the grid
});

test('scene 02 — Smart quote form autofill', async ({ page }) => {
  await nav(page, 'Quotes');
  await page.waitForTimeout(1500);
  // Open the first quote in the list to reveal the dynamic form.
  const firstRow = page.locator('table tbody tr, [role="row"]').first();
  if (await firstRow.isVisible().catch(() => false)) {
    await firstRow.click();
    await page.waitForTimeout(1800);
  }
  // Walk down through the Products section — item name / UOM / GSM are filled
  // from the linked Master Data record, not typed by hand.
  const products = page.getByText('Products', { exact: false }).first();
  if (await products.isVisible().catch(() => false)) {
    await products.scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(1500);
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(2000);
});

test('scene 03 — Your Profile', async ({ page }) => {
  await openSetting(page, 'Your Profile');
  await expect(page.getByRole('heading', { name: 'Your Profile' })).toBeVisible();
  await page.getByPlaceholder('e.g. Priya Sharma', { exact: true }).fill('Rohit Verma');
  await page.getByPlaceholder('e.g. Sales Manager', { exact: true }).fill('Sales Executive');
  await page.getByPlaceholder('e.g. +91 98765 43210', { exact: true }).fill('+91 99999 00000');
  await page.waitForTimeout(1500);
  // NOTE: uncomment to persist — writes to your profile row:
  // await page.getByRole('button', { name: 'Save Profile' }).click();
});

test('scene 04 — AI Settings', async ({ page }) => {
  await openSetting(page, 'AI Settings');
  await expect(page.getByText(/Tone|Desperation/i).first()).toBeVisible();
  await page.waitForTimeout(2500);
});

test('scene 05 — Inbox capture', async ({ page }) => {
  await nav(page, 'Inbox');
  await page.waitForTimeout(2000);
  const firstMail = page.locator('[class*="border-l-4"]').first();
  if (await firstMail.isVisible().catch(() => false)) {
    await firstMail.click();
    await page.waitForTimeout(2000);
  }
});

test('scene 06 — AI Suggested Reply (draft only)', async ({ page }) => {
  await nav(page, 'Follow ups');
  await page.getByText('Incoming', { exact: false }).first().click();
  await page.waitForTimeout(2500);
  // The AI Suggested Reply box + editable draft render here; we do NOT click Send.
});

test('scene 07 — Generate AI Actions from an inquiry email', async ({ page }) => {
  await nav(page, 'Inbox');
  await page.waitForTimeout(1500);
  const firstMail = page.locator('[class*="border-l-4"]').first();
  if (await firstMail.isVisible().catch(() => false)) {
    await firstMail.click();
    await page.waitForTimeout(1500);
    const genBtn = page.getByRole('button', { name: /Generate AI Actions/i });
    if (await genBtn.isVisible().catch(() => false)) {
      await genBtn.click();
      await page.waitForTimeout(8000); // AI extraction round-trip
    }
  }
  // NOTE: the "Create Quote Now" button here creates a real quotation — left unclicked.
});

test('scene 08 — Follow-up triage tabs + search', async ({ page }) => {
  await nav(page, 'Follow ups');
  await page.waitForTimeout(1200);
  // Type into the search box (leave the text in — clearing mid-recording isn't needed).
  const search = page.getByPlaceholder(/Search quote/i);
  if (await search.isVisible().catch(() => false)) {
    await search.pressSequentially('QN-2026', { delay: 90 });
    await page.waitForTimeout(1500);
  }
  for (const tab of ['Incoming', 'Outgoing', 'Pending Follow-ups']) {
    await page.getByText(tab, { exact: false }).first().click().catch(() => {});
    await page.waitForTimeout(1500);
  }
});

test('scene 09 — Send Reply is a manual click', async ({ page }) => {
  await nav(page, 'Follow ups');
  await page.getByText('Incoming', { exact: false }).first().click();
  await page.waitForTimeout(2000);
  const sendBtn = page.getByRole('button', { name: /Send Reply/i }).first();
  if (await sendBtn.isVisible().catch(() => false)) {
    await sendBtn.scrollIntoViewIfNeeded();
    await sendBtn.hover();
    await page.waitForTimeout(1500);
  }
  // We stop at hover — clicking would dispatch a real email.
});
