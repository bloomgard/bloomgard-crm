import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup, waitFor } from '../helpers/db';
import { runTag } from '../helpers/env';
import { makeQuote, TestQuote } from '../helpers/fixtures';
import { openAppFresh as openApp, go, openSetting, pageErrors } from './_app';

/**
 * The workspace platform in the browser: the OK list (approve runs the change), notifications,
 * team notes on a quote, Studio (apply and roll back a drafted change, which shows up on Quotes),
 * and the Automations and Plugins settings pages.
 */
test.describe.serial('Workspace platform', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  let actor: Actor; let tag: string; let q: TestQuote; let stage = 'Approved';
  const cleanup = new Cleanup();
  const rows = (kind: string) => admin().from('master_data').select('id, label, metadata').eq('tenant_id', actor.tenantId).eq('category', kind);

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag();
    q = await makeQuote(actor, cleanup, `${tag}-plat`, { status: 'Inquiry' });
  });
  test.afterAll(async () => {
    for (const kind of ['task', 'notification', 'comment', 'changeset', 'view']) {
      await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', kind).like('label', `%${tag}%`);
    }
    await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'comment').contains('metadata', { quote_id: q.id });
    await cleanup.run();
  });

  test('the sidebar has the OK list and Studio, and each new screen opens cleanly', async ({ page }) => {
    const errors = pageErrors(page);
    await openApp(page);
    for (const [nav, heading] of [['OK list', 'OK list'], ['Studio', 'Studio'], ['Team', 'Team']] as const) {
      await go(page, nav);
      await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
    }
    await openSetting(page, 'Automations');
    await expect(page.getByLabel('Ready-made automations')).toBeVisible({ timeout: 20_000 });
    await openSetting(page, 'Plugins');
    await expect(page.getByText('Webhook', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/needs your own account|Needs your account/i).first()).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('an approval on the OK list runs exactly when approved', async ({ page }) => {
    await admin().from('master_data').insert({
      tenant_id: actor.tenantId, category: 'task', label: `Move ${q.qn} ${tag}`,
      metadata: {
        type: 'approval', status: 'open', source: 'workflow', source_label: `Workflow: test ${tag}`, quote_id: q.id, qn: q.qn, created_by: actor.email,
        action: { kind: 'update_quote_status', title: 'Change quote status', summary: `${q.qn}: Inquiry → ${stage}`, details: [['Status', `Inquiry → ${stage}`]], payload: { qn: q.qn, status: stage, comment: `Approved from the OK list ${tag}` } },
      },
    });
    await openApp(page);
    await go(page, 'OK list');
    await page.getByRole('tab', { name: /Needs your OK/ }).click();
    const approve = page.getByRole('button', { name: `Approve Move ${q.qn} ${tag}` });
    await expect(approve).toBeVisible({ timeout: 20_000 });
    expect((await admin().from('quotations').select('status').eq('id', q.id).single()).data!.status).toBe('Inquiry');
    await approve.click();
    await waitFor(async () => (await admin().from('quotations').select('status').eq('id', q.id).single()).data!.status === stage, 20_000, 1000, 'status moved');
    const { data: log } = await admin().from('status_logs').select('changed_by, comments').eq('quotation_id', q.id).eq('new_status', stage);
    expect(log?.[0]).toMatchObject({ changed_by: actor.email, comments: `Approved from the OK list ${tag}` });
  });

  test('a team note is posted on the quote and the bell shows a notification that opens its quote', async ({ page }) => {
    await admin().from('master_data').insert({
      tenant_id: actor.tenantId, category: 'notification', label: `Ping on ${q.qn} ${tag}`,
      metadata: { user_id: actor.userId, title: `Ping on ${q.qn} ${tag}`, body: 'Look at this one', link: { view: 'pipeline', quote_id: q.id }, read_at: null },
    });
    await openApp(page);
    const bell = page.getByRole('button', { name: /Notifications, \d+ unread/ });
    await expect(bell).toBeVisible({ timeout: 30_000 });
    await bell.click();
    await page.getByRole('dialog', { name: 'Notifications' }).getByText(`Ping on ${q.qn} ${tag}`).click();
    const panel = page.getByRole('dialog', { name: new RegExp(`Quote ${q.qn}`) });
    await expect(panel).toBeVisible();

    const box = panel.getByLabel('Write a team note');
    await box.fill(`Client wants a sample first ${tag}`);
    await panel.getByRole('button', { name: 'Post note' }).click();
    await expect(panel.getByText(`Client wants a sample first ${tag}`)).toBeVisible();
    const saved = await waitFor(async () => {
      const { data: notes } = await rows('comment').contains('metadata', { quote_id: q.id });
      return (notes || []).find((n: any) => n.metadata.body === `Client wants a sample first ${tag}`) || null;
    }, 15_000, 1000, 'note saved');
    expect(String((saved as any).metadata.author_email).toLowerCase()).toBe(actor.email.toLowerCase());
  });

  test('Studio: a drafted view is applied, appears as a tab on Quotes, and rolls back', async ({ page }) => {
    await openApp(page);
    // draft through the same API the AI uses, as this (manager) user
    const token = await page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.includes('auth-token'));
      return k ? JSON.parse(localStorage.getItem(k) || '{}').access_token : '';
    });
    const res = await page.request.post('/api/changesets', {
      headers: { Authorization: `Bearer ${token}` },
      data: { summary: `Add a view ${tag}`, changes: [{ type: 'view.upsert', name: `Quiet big ones ${tag}`, view: { filters: { quiet_days: 0 }, shared: true } }] },
    });
    expect(res.status(), await res.text()).toBe(200);

    await go(page, 'Studio');
    const row = page.locator('[data-changeset-row]').filter({ hasText: `Add a view ${tag}` });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: 'Apply' }).click();
    await expect(row).toHaveCount(0);

    await go(page, 'Quotes');
    const tab = page.getByRole('tab', { name: `Quiet big ones ${tag}` });
    await expect(tab).toBeVisible({ timeout: 20_000 });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');

    await go(page, 'Studio');
    await page.locator('li').filter({ hasText: `Add a view ${tag}` }).getByRole('button', { name: /Roll back/ }).click();
    await waitFor(async () => ((await rows('view').like('label', `%${tag}%`)).data || []).length === 0, 20_000, 1000, 'view removed');
  });
});
