import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup, waitFor } from '../helpers/db';
import { runTag, DUMMY_RECIPIENT } from '../helpers/env';
import { seedCatalogue } from '../helpers/fixtures';
import { openApp, go } from './_app';

/** Bloomgard AI in the inbox: it reads an enquiry into a lead, then turns it into a quotation in one click. */
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
    await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'lead').contains('metadata', { email_id: emailId });
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

  test('Bloomgard AI reads the enquiry: who, what, matched to the catalogue, and a reply to use', async ({ page }) => {
    test.setTimeout(150_000);
    await openApp(page);
    await go(page, 'Inbox');
    await page.getByRole('button', { name: /refresh/i }).click();
    await page.locator('[class*="border-l-4"]', { hasText: `Enquiry AI UI ${tag}` }).click();
    const panel = page.getByRole('region', { name: 'AI reading' }).or(page.locator('section[aria-label="AI reading"]')).first();
    // an email that arrived before leads existed is read on request
    const readIt = panel.getByRole('button', { name: 'Read it' });
    await expect(readIt.or(panel.getByText(/Enquiry · (hot|warm|cold)/))).toBeVisible({ timeout: 30_000 }); // finished loading
    if (await readIt.isVisible()) await readIt.click();
    await expect(panel.getByText(/Enquiry · (hot|warm|cold)/)).toBeVisible({ timeout: 90_000 });
    await expect(panel.getByLabel('What they asked for')).toContainText(code());
    await panel.getByRole('button', { name: 'Use reply' }).click();
    await expect(page.locator('#inbox-reply')).not.toHaveValue('');
  });

  test('Create quote builds the quotation with the line item resolved from Master Data', async ({ page }) => {
    test.setTimeout(150_000);
    await openApp(page);
    await go(page, 'Inbox');
    await page.getByRole('button', { name: /refresh/i }).click();
    await page.locator('[class*="border-l-4"]', { hasText: `Enquiry AI UI ${tag}` }).click();
    const panel = page.locator('section[aria-label="AI reading"]').first();
    const readIt = panel.getByRole('button', { name: 'Read it' });
    await expect(readIt.or(panel.getByRole('button', { name: 'Create quote' }))).toBeVisible({ timeout: 30_000 });
    if (await readIt.isVisible()) await readIt.click();
    await expect(panel.getByRole('button', { name: 'Create quote' })).toBeVisible({ timeout: 90_000 });
    await panel.getByRole('button', { name: 'Create quote' }).click();
    const q = await waitFor(async () => {
      const { data } = await admin().from('quotations').select('id, status').eq('tenant_id', actor.tenantId).contains('custom_metadata', { source_email_id: emailId }).maybeSingle();
      return data;
    }, 60_000, 1000, 'created quotation');
    expect(q.status).toBe('Inquiry');
    const { data: items } = await admin().from('quotation_items').select('item_code, item_name, uom, item_rate, quantity').eq('quotation_id', q.id);
    expect(items![0]).toMatchObject({ item_code: code(), item_name: `E2E Valve ${tag}`, uom: 'SET' });
    expect(Number(items![0].item_rate)).toBeCloseTo(250);
    expect(Number(items![0].quantity)).toBe(12);
    // the quote opens, and the email's lead now points at it
    await expect(page.getByRole('dialog', { name: /Quote QN-/ })).toBeVisible({ timeout: 20_000 });
  });
});
