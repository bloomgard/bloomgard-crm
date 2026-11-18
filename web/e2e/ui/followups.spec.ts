import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup } from '../helpers/db';
import { runTag } from '../helpers/env';
import { makeQuote, snapshotThreads, TestQuote } from '../helpers/fixtures';
import { openApp, go, captureDialogs, pageErrors } from './_app';

test.describe.serial('Follow-ups screen', () => {
  let actor: Actor;
  let tag: string;
  const cleanup = new Cleanup();
  let hot: TestQuote, warm: TestQuote, cold: TestQuote, incoming: TestQuote;

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag();
    await snapshotThreads(actor, cleanup);
    hot = await makeQuote(actor, cleanup, `${tag} hot`, { daysQuiet: 1 });
    warm = await makeQuote(actor, cleanup, `${tag} warm`, { daysQuiet: 7 });
    cold = await makeQuote(actor, cleanup, `${tag} cold`, { daysQuiet: 15 });
    incoming = await makeQuote(actor, cleanup, `${tag} incoming`, { withThread: 'incoming', daysQuiet: 0 });
    await admin().from('email_threads').update({ ai_draft_text: `Draft for the client ${tag}` }).eq('quote_id', incoming.id);
  });
  test.afterAll(async () => {
    await admin().from('sent_emails').delete().eq('tenant_id', actor.tenantId).like('subject', `%${tag}%`);
    await cleanup.run();
  });

  test('quiet quotes are scored, searchable, and listed hottest first', async ({ page }) => {
    const errors = pageErrors(page);
    await openApp(page);
    await go(page, 'Follow ups');
    await page.locator('select#fu-days').selectOption({ label: '0 Days (Immediate)' });
    const search = page.getByPlaceholder(/Search quote/i);
    await search.fill(`E2E Co ${tag}`);
    const rows = page.locator('.fu-row').filter({ hasText: `QN-9999` });
    await expect(rows.first()).toBeVisible();
    await expect(page.getByText(/QN-9999-\d+/).first()).toBeVisible();
    const text = await page.locator('main').innerText();
    const order = ['HOT', 'WARM', 'COLD'].map((w) => text.indexOf(w));
    expect(order.every((i) => i >= 0), `badges missing in: ${order}`).toBe(true);
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    // narrowing to one quote by its number
    await search.fill(cold.qn);
    await expect(page.getByText('Cold', { exact: true })).toHaveCount(1);
    await expect(page.getByText('Hot', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Warm', { exact: true })).toHaveCount(0);
    void rows;
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('typing in the search box never crashes the page', async ({ page }) => {
    const errors = pageErrors(page);
    await openApp(page);
    await go(page, 'Follow ups');
    const search = page.getByPlaceholder(/Search quote/i);
    await search.pressSequentially('QN-2026-', { delay: 60 });
    await search.fill('');
    await expect(page.getByText(/couldn.t load/i)).toHaveCount(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('an incoming thread shows its draft; sending moves it to Outgoing and clears the draft', async ({ page }) => {
    const dialogs = captureDialogs(page);
    await openApp(page);
    await go(page, 'Follow ups');
    await page.getByRole('tab', { name: /Incoming/ }).click();
    const card = page.locator('.fu-thread', { hasText: incoming.qn }).last();
    await expect(card).toBeVisible();
    const draft = card.getByPlaceholder(/type a manual reply/i);
    await expect(draft).toHaveValue(`Draft for the client ${tag}`);
    await draft.fill(`Draft for the client ${tag} — edited`);
    await card.getByRole('button', { name: 'Send Reply', exact: true }).click();
    await expect.poll(() => dialogs.join('|'), { timeout: 30_000 }).toMatch(/Reply sent successfully/);
    const { data: t } = await admin().from('email_threads').select('triage_status, ai_draft_text').eq('quote_id', incoming.id).single();
    expect(t).toEqual({ triage_status: 'outgoing', ai_draft_text: null });
    await page.getByRole('tab', { name: /Outgoing/ }).click();
    await expect(page.locator('.fu-thread', { hasText: incoming.qn }).last()).toBeVisible();
    const { data: sent } = await admin().from('sent_emails').select('recipient').eq('tenant_id', actor.tenantId).eq('subject', `Re: Following up on Quote ${incoming.qn}`);
    expect(sent).toHaveLength(1);
  });

  // The follow-up history used to be rendered but unreachable: there was no tab that opened it.
  test('Done lists the quotes already followed up, with the exchange behind them', async ({ page }) => {
    const done = await makeQuote(actor, cleanup, `${tag} done`, { daysQuiet: 4 });
    await admin().from('quotations').update({
      follow_up_status: 'Agent Dispatched',
      custom_metadata: {
        'Client Information': { client_name: `E2E Co ${tag} done` },
        agent_summary: `Client asked for a revised rate ${tag}`,
        agent_conversations: [{ role: 'agent', content: `Following up ${tag}`, timestamp: new Date().toISOString() }],
      },
    }).eq('id', done.id);

    await openApp(page);
    await go(page, 'Follow ups');
    await page.getByRole('tab', { name: /^Done/ }).click();
    const row = page.locator('.fu-thread', { hasText: done.qn });
    await expect(row).toBeVisible();
    await expect(row.getByText(`Client asked for a revised rate ${tag}`)).toHaveCount(0); // collapsed
    await row.getByRole('button').first().click();
    await expect(row.getByText(`Client asked for a revised rate ${tag}`)).toBeVisible();
    await expect(row.getByText(`Following up ${tag}`)).toBeVisible();

    // and it is not also sitting in Due, which is only what still needs doing
    await page.getByRole('tab', { name: /^Due/ }).click();
    await page.locator('select#fu-days').selectOption({ label: '0 Days (Immediate)' });
    await expect(page.locator('.fu-row', { hasText: done.qn })).toHaveCount(0);
  });
});
