import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup, waitFor } from '../helpers/db';
import { runTag, DUMMY_RECIPIENT } from '../helpers/env';
import { seedCatalogue } from '../helpers/fixtures';
import { openApp, go, captureDialogs } from './_app';

/** AI actions in the inbox: analyse an enquiry, then turn it into a quotation in one click. */
test.describe.serial('Inbox AI actions', () => {
  let actor: Actor;
  let tag: string;
  const cleanup = new Cleanup();
  const code = () => `E2E-${tag.toUpperCase()}-IX`;
  let emailId: string;

  test.beforeAll(async ({ request }) => {
    actor = await resolveActor(); tag = runTag();
    await seedCatalogue(request, actor, cleanup, [[code(), `E2E Valve ${tag}`, 'SET', '250.00']]);
    const { data } = await admin().from('inbound_emails').insert({
      tenant_id: actor.tenantId, thread_id: `aiui-${tag}`, message_id: `aiui-${tag}`, sender_email: `Dev Patel <dev-${tag}@e2e-valves.test>`,
      subject: `Enquiry AI UI ${tag}`, is_read: false, is_deleted: false,
      body_text: `Hello, please quote 12 sets of ${code()} delivered to Surat. Regards, Dev Patel, dev-${tag}@e2e-valves.test`,
    }).select('id').single();
    emailId = data!.id;
    cleanup.delete('inbound_emails', 'id', emailId);
  });
  test.afterAll(async () => {
    const { data: qs } = await admin().from('quotations').select('id, client_id').eq('tenant_id', actor.tenantId).contains('custom_metadata', { source_email_id: emailId });
    for (const q of qs || []) {
      await admin().from('status_logs').delete().eq('quotation_id', q.id);
      await admin().from('email_threads').delete().eq('quote_id', q.id);
      await admin().from('quotation_items').delete().eq('quotation_id', q.id);
      await admin().from('quotations').delete().eq('id', q.id);
      if (q.client_id) await admin().from('clients').delete().eq('id', q.client_id);
    }
    await cleanup.run();
  });

  test('Generate AI Actions summarises the enquiry and drafts a catalogue-grounded reply', async ({ page }) => {
    test.setTimeout(150_000);
    await openApp(page);
    await go(page, 'Inbox');
    await page.getByRole('button', { name: /refresh/i }).click();
    await page.locator('[class*="border-l-4"]', { hasText: `Enquiry AI UI ${tag}` }).click();
    await page.getByRole('button', { name: /Generate AI Actions/i }).click();
    await expect(page.getByText('Summary', { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText('Lead Gen Quote Extracted')).toBeVisible();
    await expect(page.getByText(code()).first()).toBeVisible();
    await expect(page.getByText('Drafted Auto-Reply')).toBeVisible();
  });

  test('Create Quote Now builds the quotation with the line item resolved from Master Data', async ({ page }) => {
    test.setTimeout(150_000);
    const dialogs = captureDialogs(page);
    await openApp(page);
    await go(page, 'Inbox');
    await page.getByRole('button', { name: /refresh/i }).click();
    await page.locator('[class*="border-l-4"]', { hasText: `Enquiry AI UI ${tag}` }).click();
    await page.getByRole('button', { name: /Generate AI Actions/i }).click();
    await expect(page.getByRole('button', { name: /Create Quote Now/i })).toBeVisible({ timeout: 90_000 });
    await page.getByRole('button', { name: /Create Quote Now/i }).click();
    await expect.poll(() => dialogs.join('|'), { timeout: 60_000 }).toMatch(/Created QN-/);
    const q = await waitFor(async () => {
      const { data } = await admin().from('quotations').select('id, status').eq('tenant_id', actor.tenantId).contains('custom_metadata', { source_email_id: emailId }).maybeSingle();
      return data;
    }, 20_000, 1000, 'created quotation');
    expect(q.status).toBe('Inquiry');
    const { data: items } = await admin().from('quotation_items').select('item_code, item_name, uom, item_rate, quantity').eq('quotation_id', q.id);
    expect(items![0]).toMatchObject({ item_code: code(), item_name: `E2E Valve ${tag}`, uom: 'SET' });
    expect(Number(items![0].item_rate)).toBeCloseTo(250);
    expect(Number(items![0].quantity)).toBe(12);
  });
});
