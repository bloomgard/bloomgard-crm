import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, waitFor } from '../helpers/db';
import { runTag } from '../helpers/env';
import { openAppFresh as openApp, go } from './_app';

/**
 * Leads from the inbox: a lead the AI already read (seeded, so no AI call) shows on Lead Gen with its
 * contact and what was asked for; the Inbox reading pane shows the same reading with Create quote and
 * Use reply; Create quote on the lead makes a real quotation and marks the lead converted.
 */
test.describe.serial('Leads', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  let actor: Actor; let tag: string;
  let emailId = ''; let leadId = '';
  const company = () => `Leadwell Textiles ${tag}`;
  const subject = () => `Enquiry for poplin ${tag}`;

  test.beforeAll(async () => {
    actor = await resolveActor(); tag = runTag();
    const { data: em, error: e1 } = await admin().from('inbound_emails').insert({
      tenant_id: actor.tenantId, sender_email: `buyer-${tag}@leadwell-e2e.test`, subject: subject(),
      body_text: `Hello, please quote 2000 metres of cotton poplin by Friday. Regards, Kavya Iyer, Purchase Manager, ${company()}, +91 98200 00000`,
    }).select('id').single();
    if (e1) throw new Error(e1.message);
    emailId = em!.id;
    const { data: lead, error: e2 } = await admin().from('master_data').insert({
      tenant_id: actor.tenantId, category: 'lead', label: `${company()}: wants 2000 m of cotton poplin`,
      metadata: {
        status: 'new', kind: 'enquiry', source: 'email', email_id: emailId, subject: subject(), received_at: new Date().toISOString(),
        from_email: `buyer-${tag}@leadwell-e2e.test`,
        contact: { name: 'Kavya Iyer', company: company(), designation: 'Purchase Manager', phone: '+91 98200 00000' },
        summary: `${company()} wants 2000 m of cotton poplin by Friday.`,
        intent: 'new_enquiry', urgency: 'high', deadline: 'Friday',
        requirements: [
          { text: '2000 metres of cotton poplin', item_name: `Cotton Poplin ${tag}`, quantity: 2000, uom: 'MTR', match: 'none' },
        ],
        score: 72, temperature: 'hot', score_reasons: ['writes from a company domain', 'needs it by Friday'],
        existing_client: null, reply_draft: `Dear Kavya, thank you for your enquiry ${tag}. We will send the quotation shortly.`,
        owner_email: null,
      },
    }).select('id').single();
    if (e2) throw new Error(e2.message);
    leadId = lead!.id;
  });

  test.afterAll(async () => {
    const { data: l } = await admin().from('master_data').select('metadata').eq('id', leadId).maybeSingle();
    const quoteId = (l?.metadata as any)?.quote_id;
    if (quoteId) {
      const { data: q } = await admin().from('quotations').select('client_id').eq('id', quoteId).maybeSingle();
      for (const t of ['quotation_items', 'status_logs']) await admin().from(t).delete().eq('quotation_id', quoteId);
      await admin().from('email_threads').delete().eq('quote_id', quoteId);
      await admin().from('quotations').delete().eq('id', quoteId);
      if (q?.client_id) await admin().from('clients').delete().eq('id', q.client_id);
    }
    await admin().from('clients').delete().eq('tenant_id', actor.tenantId).eq('company_name', company());
    await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'lead').eq('id', leadId);
    await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'notification').like('label', `%${tag}%`);
    await admin().from('inbound_emails').delete().eq('id', emailId);
  });

  test('the Inbox reading pane shows what the AI read, with Create quote and Use reply', async ({ page }) => {
    await openApp(page);
    await go(page, 'Inbox');
    await page.getByText(subject()).first().click();
    const panel = page.locator(`[data-email-lead="${leadId}"]`);
    await expect(panel).toBeVisible({ timeout: 20_000 });
    await expect(panel).toContainText(/Enquiry · hot 72/i);
    await expect(panel).toContainText('not in catalogue');
    await expect(panel.getByRole('button', { name: 'Create quote' })).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Use reply' })).toBeVisible();
  });

  test('Lead Gen lists the lead; the drawer shows the contact and items; Create quote converts it', async ({ page }) => {
    await openApp(page);
    await go(page, 'Lead Gen');
    const row = page.locator(`[data-lead="${leadId}"]`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row).toContainText(company());
    await expect(row).toContainText('Hot');
    await row.click();

    const drawer = page.getByRole('dialog', { name: `Lead: ${company()}` });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Kavya Iyer');
    await expect(drawer.getByRole('link', { name: '+91 98200 00000' })).toHaveAttribute('href', 'tel:+919820000000');
    await expect(drawer).toContainText('2000 metres of cotton poplin');
    await expect(drawer).toContainText('Not in catalogue');
    await expect(drawer).toContainText('needs it by Friday');

    await drawer.getByRole('button', { name: 'Create quote' }).click();
    const quoteId = await waitFor(async () => {
      const { data } = await admin().from('master_data').select('metadata').eq('id', leadId).single();
      return (data!.metadata as any).status === 'converted' ? (data!.metadata as any).quote_id : null;
    }, 30_000, 1000, 'lead converted');
    const { data: q } = await admin().from('quotations').select('tenant_id, status, created_by_email').eq('id', quoteId).single();
    expect(q!.tenant_id).toBe(actor.tenantId);
    const { data: items } = await admin().from('quotation_items').select('quantity').eq('quotation_id', quoteId);
    expect(items?.[0]?.quantity).toBe(2000);
  });
});
