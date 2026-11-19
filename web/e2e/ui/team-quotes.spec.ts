import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup } from '../helpers/db';
import { runTag } from '../helpers/env';
import { makeQuote, TestQuote } from '../helpers/fixtures';
import { openAppFresh as openApp, go, openSetting, pageErrors } from './_app';

/**
 * Team (People & activity, Planning, Chat), the notification panel and inbox layout, and the
 * Quotes list: columns, status chips, search, find-in-quote, and Import & export in Settings.
 */
test.describe.serial('Team tabs, layout fixes and the Quotes list', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  let actor: Actor; let tag: string; let q: TestQuote;
  const cleanup = new Cleanup();

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag();
    q = await makeQuote(actor, cleanup, `${tag}-tq`, { status: 'Inquiry' });
    cleanup.add(async () => {
      await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).in('category', ['card', 'message']).like('label', `%${tag}%`);
    });
  });
  test.afterAll(async () => { await cleanup.run(); });

  test('the notification panel sits above the page, and the inbox fills the screen', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: /^Notifications/ }).click();
    const panel = page.getByRole('dialog', { name: 'Notifications' });
    await expect(panel).toBeVisible();
    // the part of the panel past the sidebar's edge is the panel, not the page under it
    const onTop = await panel.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.right - 12, r.top + 20);
      return !!hit && el.contains(hit);
    });
    expect(onTop).toBe(true);
    await page.keyboard.press('Escape');

    await go(page, 'Inbox');
    const gap = await page.getByTestId('inbox-layout').evaluate((el) => window.innerHeight - el.getBoundingClientRect().bottom);
    expect(gap).toBeLessThan(40);
  });

  test('Team has People & activity, Planning and Chat; a card and a message can be added', async ({ page }) => {
    const errors = pageErrors(page);
    await openApp(page);
    await go(page, 'Team');
    for (const t of ['People & activity', 'Planning', 'Chat']) await expect(page.getByRole('tab', { name: t })).toBeVisible();

    await page.getByRole('tab', { name: 'Planning' }).click();
    await page.getByRole('button', { name: 'Add a card' }).first().click();
    await page.getByRole('textbox', { name: /^New card in/ }).fill(`Call the fair organiser ${tag}`);
    await page.keyboard.press('Enter');
    const card = page.getByRole('button', { name: new RegExp(`Call the fair organiser ${tag}`) });
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.click();
    const dlg = page.getByRole('dialog', { name: /^Card:/ });
    await dlg.getByLabel('Add a checklist item').fill('Get the floor plan');
    await dlg.getByRole('button', { name: 'Add', exact: true }).click();
    await dlg.getByLabel('Priority').selectOption('high');
    await dlg.getByRole('button', { name: 'Save' }).click();
    await expect(dlg).toBeHidden();
    await expect(card).toContainText('0/1');
    await expect(card.getByLabel('High priority')).toBeVisible();

    await page.getByRole('tab', { name: 'Chat' }).click();
    await expect(page.getByRole('heading', { name: '#general' })).toBeVisible({ timeout: 20_000 });
    const box = page.getByRole('textbox', { name: 'Message #general' });
    await box.fill(`Stall booked for ${q.qn} ${tag}`);
    await page.keyboard.press('Enter');
    await expect(page.getByText(`Stall booked for`, { exact: false }).filter({ hasText: tag })).toBeVisible({ timeout: 15_000 });
    // the quote number became a link that opens the quote
    await page.getByRole('button', { name: q.qn }).last().click();
    await expect(page.getByRole('dialog', { name: new RegExp(`Quote ${q.qn}`) })).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('Quotes: choose columns, filter by status, search inside quotes, find inside one', async ({ page }) => {
    await openApp(page);
    await go(page, 'Quotes');
    // export and import moved to Settings
    await expect(page.getByRole('combobox').filter({ hasText: 'Export...' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Import', exact: true })).toHaveCount(0);

    const table = page.getByTestId('quotes-table');
    await page.getByRole('button', { name: 'Columns' }).click();
    await page.getByRole('dialog', { name: 'Columns' }).getByRole('checkbox', { name: 'Days quiet' }).check();
    await page.keyboard.press('Escape');
    await expect(table.getByRole('columnheader', { name: /Days quiet/ })).toBeVisible();
    // sort by it
    await table.getByRole('button', { name: /Days quiet/ }).click();
    await expect(table.getByRole('columnheader', { name: /Days quiet/ })).toHaveAttribute('aria-sort', /ascending|descending/);

    // search reaches inside the quote, not just the client name
    await page.getByLabel('Search quotes').fill(q.qn);
    await expect(table.locator('tbody tr')).toHaveCount(1);
    await expect(table).toContainText(q.qn);
    const inquiry = page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: /^Inquiry/ });
    await inquiry.click();
    await expect(inquiry).toHaveAttribute('aria-pressed', 'true');
    await expect(table).toContainText(q.qn);
    await page.getByRole('group', { name: 'Filter by status' }).getByRole('button', { name: /^Lost/ }).click().catch(() => {});

    // find in the open quote
    await page.getByLabel('Search quotes').fill('');
    await page.getByRole('button', { name: 'Clear all' }).click().catch(() => {});
    await page.getByLabel('Search quotes').fill(q.qn);
    await table.locator('tbody tr').first().click();
    const drawer = page.getByRole('dialog', { name: new RegExp(`Quote ${q.qn}`) });
    await drawer.getByRole('textbox', { name: 'Find in this quote' }).fill(q.qn);
    await expect(drawer.getByText(/^1 of \d+$/)).toBeVisible();
    await drawer.getByRole('textbox', { name: 'Find in this quote' }).fill(`zz-nothing-${tag}`);
    await expect(drawer.getByText('No matches')).toBeVisible();
    await page.getByRole('button', { name: 'Close quote' }).click();

    // put the columns back
    await page.getByRole('button', { name: 'Columns' }).click();
    await page.getByRole('dialog', { name: 'Columns' }).getByRole('button', { name: /Default/ }).click();

    await openSetting(page, 'Import & export');
    await expect(page.getByRole('button', { name: 'Download spreadsheet (CSV)' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Choose a backup file/ })).toBeVisible();
  });
});
