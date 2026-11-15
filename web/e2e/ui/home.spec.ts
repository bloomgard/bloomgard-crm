import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup } from '../helpers/db';
import { runTag } from '../helpers/env';
import { makeQuote, TestQuote } from '../helpers/fixtures';
import { openAppFresh as openApp, go, pageErrors } from './_app';

/** The AI home: the first thing a user sees. Stats, latest quotes, chips, and the chat that can act. */
test.describe('Bloomgard AI home', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // own session: see openAppFresh
  let actor: Actor; let tag: string; let q: TestQuote;
  const cleanup = new Cleanup();
  const input = (page: any) => page.getByLabel('Message Bloomgard AI');
  const status = async () => (await admin().from('quotations').select('status').eq('id', q.id).single()).data!.status;

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag();
    q = await makeQuote(actor, cleanup, `${tag}-home`, { status: 'Inquiry' });
  });
  test.afterAll(async () => { await cleanup.run(); });

  test('opens on the assistant with live stats, three latest quotes, a create button and suggestion chips', async ({ page }) => {
    const errors = pageErrors(page);
    await openApp(page);
    await expect(page.getByRole('region', { name: 'Bloomgard AI' })).toBeVisible();
    await expect(input(page)).toBeFocused();

    const stats = page.getByLabel('Pipeline statistics');
    await expect(stats.getByText('Total quotes')).toBeVisible();
    await expect(stats.getByText('Status & logs')).toBeVisible();
    await expect(stats.getByText('My contribution')).toBeVisible();
    const { count } = await admin().from('quotations').select('id', { count: 'exact', head: true }).eq('tenant_id', actor.tenantId).neq('status', 'Lead');
    await expect(stats.locator('.agent-num').first()).toHaveText(String(count));

    await expect(page.getByLabel('Latest quotes').locator('.agent-quote')).toHaveCount(Math.min(3, count || 0));
    await expect(page.getByRole('button', { name: 'Create quote' })).toBeVisible();
    // exactly three choice chips; the rest live in the drop-up
    await expect(page.getByLabel('Suggestions').getByRole('button')).toHaveCount(3);
    await expect(page.getByRole('listbox')).toHaveCount(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('clicking the command bar drops up more questions; they filter, fill templates and close on Escape', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('listbox')).toHaveCount(0); // not open just because the box is autofocused
    await input(page).click();
    const list = page.getByRole('listbox', { name: 'More questions to ask' });
    await expect(list).toBeVisible();
    expect(await list.getByRole('option').count()).toBeGreaterThanOrEqual(8);

    await input(page).fill('chart');
    const filtered = await list.getByRole('option').allInnerTexts();
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((t) => /chart/i.test(t))).toBe(true);

    await input(page).fill('');
    await list.getByRole('option', { name: /Create a quote for/ }).click(); // a template: lands in the box for editing
    await expect(input(page)).toHaveValue(/Create a quote for/);
    await expect(list).toBeHidden();

    await input(page).fill('');
    await input(page).click();
    await expect(list).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(list).toBeHidden();
  });

  test('on a signed-in device the root URL opens the workspace, like Gmail', async ({ page }) => {
    await openApp(page);
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(input(page)).toBeVisible({ timeout: 45_000 });
  });

  test('the home shows a greeting with a clickable briefing, and no separate assistant header', async ({ page }) => {
    await openApp(page);
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)|Working late/ })).toBeVisible();
    await expect(page.getByText(/connected · quotes/i)).toHaveCount(0);
    await expect(page.getByLabel('Briefing').getByRole('button', { name: 'Brief me' })).toBeVisible();
  });

  test('Create quote opens the new-quote form; a latest-quote card opens that quote', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Create quote' }).click();
    await expect(page.getByRole('heading', { name: /Create Entry/ })).toBeVisible();

    await go(page, 'Home');
    const first = page.getByLabel('Latest quotes').locator('.agent-quote').first();
    const qn = (await first.locator('.font-mono').innerText()).trim();
    await first.click();
    await expect(page.getByText(qn).first()).toBeVisible();
    await expect(page.getByText('Manifest Audit Log')).toBeVisible();
  });

  test('Ctrl+K focuses the command bar from anywhere on the page', async ({ page }) => {
    await openApp(page);
    await page.getByLabel('Pipeline statistics').click();
    await input(page).blur();
    await page.keyboard.press('Control+k');
    await expect(input(page)).toBeFocused();
  });

  test('asking a question shows the tools it used and an answer drawn from the data', async ({ page }) => {
    test.setTimeout(150_000);
    await openApp(page);
    await input(page).fill('How many quotes do I have in total? Just the number and a one line comment.');
    await input(page).press('Enter');
    await expect(page.locator('.agent-step').first()).toBeVisible({ timeout: 60_000 });
    const { count } = await admin().from('quotations').select('id', { count: 'exact', head: true }).eq('tenant_id', actor.tenantId).neq('status', 'Lead');
    await expect(page.getByRole('region', { name: 'Bloomgard AI' })).toContainText(String(count), { timeout: 90_000 });
    await page.getByRole('button', { name: 'New chat' }).click();
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening)|Working late/ })).toBeVisible();
  });

  test('asking for an export gives a download in the chat', async ({ page }) => {
    test.setTimeout(150_000);
    await openApp(page);
    await page.getByRole('button', { name: 'New chat' }).click().catch(() => {});
    await input(page).fill('Export all my quotes to Excel.');
    await input(page).press('Enter');
    const card = page.locator('[data-export]').last();
    await expect(card).toBeVisible({ timeout: 90_000 });
    const [download] = await Promise.all([page.waitForEvent('download'), card.getByRole('button', { name: 'Download' }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    expect((await download.path()) || '').toBeTruthy();
  });

  test('a chart request draws a chart in the chat', async ({ page }) => {
    test.setTimeout(150_000);
    await openApp(page);
    await page.getByRole('button', { name: 'New chat' }).click().catch(() => {});
    await input(page).fill('Show a pie chart of quote count by status.');
    await input(page).press('Enter');
    await expect(page.locator('.agent-block svg.recharts-surface').first()).toBeVisible({ timeout: 90_000 });
  });

  test('a status change is prepared as a card; Dismiss leaves the quote alone, Confirm applies it', async ({ page }) => {
    test.setTimeout(240_000);
    await openApp(page);
    await page.getByRole('button', { name: 'New chat' }).click().catch(() => {});

    await input(page).fill(`Change the status of ${q.qn} to Pending.`);
    await input(page).press('Enter');
    const card = page.locator('.agent-action').last();
    await expect(card).toContainText('Change quote status', { timeout: 90_000 });
    await expect(card).toContainText(`Inquiry → Pending`);
    expect(await status()).toBe('Inquiry');

    await card.getByRole('button', { name: 'Dismiss' }).click();
    await expect(card).toContainText('Nothing was changed');
    expect(await status()).toBe('Inquiry');

    await input(page).fill(`Change the status of ${q.qn} to Pending.`);
    await expect(page.getByRole('button', { name: 'Send' })).toBeEnabled({ timeout: 90_000 }); // previous answer finished
    await input(page).press('Enter');
    const card2 = page.locator('.agent-action').last();
    await expect(card2.getByRole('button', { name: 'Confirm' })).toBeVisible({ timeout: 90_000 });
    await card2.getByRole('button', { name: 'Confirm' }).click();
    await expect(card2).toContainText(`${q.qn} is now Pending`, { timeout: 30_000 });
    expect(await status()).toBe('Pending');
  });
});
