import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup, waitFor } from '../helpers/db';
import { ENV, protectionHeaders, runTag } from '../helpers/env';
import { seedCatalogue } from '../helpers/fixtures';
import { userToken, authed } from '../helpers/agent';

/**
 * Leads from the inbox: the AI reads an enquiry once, pulls the sender's details, matches what was
 * asked for against the real catalogue (never inventing a code), scores it; a person converts it to
 * a quotation. Newsletters are kept as "not a lead" so the inbox can label them.
 */
test.describe.serial('Leads', () => {
  let actor: Actor; let tag: string; let token: string;
  const cleanup = new Cleanup();
  const code = () => `E2E-${tag.toUpperCase()}-L`;
  const emails: string[] = []; const quotes: string[] = [];
  const post = (request: any, path: string, data: any) => request.post(`${ENV.baseUrl}${path}`, { headers: authed(token), data, timeout: 120_000 });
  const get = (request: any, path: string) => request.get(`${ENV.baseUrl}${path}`, { headers: authed(token) });

  const email = async (sender: string, subject: string, body_text: string) => {
    const { data } = await admin().from('inbound_emails').insert({ tenant_id: actor.tenantId, sender_email: sender, subject, body_text, message_id: `e2e-${tag}-${emails.length}`, is_read: false }).select('id').single();
    emails.push(data!.id);
    return data!.id as string;
  };

  test.beforeAll(async ({ request }) => {
    actor = await resolveActor(); tag = runTag(); token = await userToken();
    await seedCatalogue(request, actor, cleanup, [[code(), `E2E Flange ${tag}`, 'PCS', '480.00']]);
  });
  test.afterAll(async () => {
    await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'lead').in('metadata->>email_id', emails);
    await admin().from('master_data').delete().eq('tenant_id', actor.tenantId).eq('category', 'lead').like('label', `%${tag}%`);
    for (const id of quotes) {
      const { data: q } = await admin().from('quotations').select('client_id').eq('id', id).maybeSingle();
      await admin().from('email_threads').delete().eq('quote_id', id);
      await admin().from('status_logs').delete().eq('quotation_id', id);
      await admin().from('quotation_items').delete().eq('quotation_id', id);
      await admin().from('quotations').delete().eq('id', id);
      if (q?.client_id) await admin().from('clients').delete().eq('id', q.client_id);
    }
    if (emails.length) await admin().from('inbound_emails').delete().in('id', emails);
    await cleanup.run();
  });

  test('every route needs a signed-in user', async ({ request }) => {
    expect((await request.get(`${ENV.baseUrl}/api/leads`, { headers: protectionHeaders() })).status()).toBe(401);
    expect((await request.post(`${ENV.baseUrl}/api/leads`, { headers: protectionHeaders(), data: { action: 'scan' } })).status()).toBe(401);
  });

  test('an enquiry is read into a lead: details from the signature, items matched to the catalogue, nothing invented', async ({ request }) => {
    test.setTimeout(150_000);
    const id = await email(`Meera Shah <meera@e2e-${tag}-steel.test>`, `Enquiry ${tag}: flanges`,
      `Hello,\n\nPlease send your best price for 300 pcs of ${code()} and 50 pcs of your titanium widget XQ-77.\nWe need delivery before 15 December, it is urgent.\n\nRegards,\nMeera Shah\nPurchase Manager\nShah Steel Works ${tag}\n+91 98765 43210\nGSTIN 27AAACS1234F1Z5\nPune`);
    const res = await post(request, '/api/leads', { action: 'from_email', email_id: id });
    expect(res.status(), await res.text()).toBe(200);
    const { lead } = await res.json();
    expect(lead.kind).toBe('enquiry');
    expect(lead.status).toBe('new');
    expect(lead.contact.phone || '').toMatch(/98765/);
    expect(JSON.stringify(lead.contact)).toMatch(/Shah/);
    const flange = lead.requirements.find((r: any) => r.item_code === code());
    expect(flange, JSON.stringify(lead.requirements)).toBeTruthy();
    expect(flange).toMatchObject({ match: 'code', quantity: 300, rate: 480 });
    // the widget is not in the catalogue: kept, but never given a code or a price
    const widget = lead.requirements.find((r: any) => /XQ-77|widget/i.test(`${r.text} ${r.item_name}`));
    expect(widget?.match).toBe('none');
    expect(widget?.rate ?? null).toBeNull();
    expect(lead.score).toBeGreaterThanOrEqual(40);
    expect(lead.score_reasons.join(' ')).toMatch(/catalogue/);
    expect(lead.reply_draft).not.toMatch(/₹\s?\d|\[(your|name)/i);

    // read once: asking again returns the same lead without a second reading
    const again = await (await post(request, '/api/leads', { action: 'from_email', email_id: id })).json();
    expect(again.lead.id).toBe(lead.id);
  });

  test('a newsletter is kept as "not a lead", and a person can overrule that', async ({ request }) => {
    test.setTimeout(150_000);
    const id = await email(`news@e2e-${tag}-mailer.test`, `Our November newsletter ${tag}`, 'This month: our team outing, five reading tips, and a recipe. Unsubscribe at the link below.');
    const { lead } = await (await post(request, '/api/leads', { action: 'from_email', email_id: id })).json();
    expect(lead.kind).not.toBe('enquiry');
    expect(lead.status).toBe('discarded');
    const open = (await (await get(request, '/api/leads')).json()).leads.map((l: any) => l.id);
    expect(open).not.toContain(lead.id);
    const fixed = await request.patch(`${ENV.baseUrl}/api/leads/${lead.id}`, { headers: authed(token), data: { status: 'new' } });
    expect((await fixed.json()).lead).toMatchObject({ status: 'new', kind: 'enquiry' });
  });

  test('a lead becomes a quotation with its matched items, once', async ({ request }) => {
    const { data: rec } = await admin().from('master_data').insert({
      tenant_id: actor.tenantId, category: 'lead', label: `Seeded ${tag}`,
      metadata: {
        status: 'qualified', kind: 'enquiry', source: 'manual', from_email: `buyer@e2e-${tag}-co.test`, subject: `Seeded ${tag}`,
        contact: { name: 'Ravi Kumar', company: `Kumar Fabs ${tag}`, phone: '+91 90000 00000' }, summary: 'Wants flanges',
        requirements: [{ text: `120 pcs ${code()}`, item_code: code(), item_name: `E2E Flange ${tag}`, quantity: 120, uom: 'PCS', rate: 480, match: 'code' }],
        score: 70, temperature: 'hot', score_reasons: [], reply_draft: 'Thanks', owner_email: actor.email,
      },
    }).select('id').single();
    const res = await post(request, `/api/leads/${rec!.id}`, { action: 'convert' });
    expect(res.status(), await res.text()).toBe(200);
    const out = await res.json();
    quotes.push(out.quote_id);
    const { data: q } = await admin().from('quotations').select('status, created_by_email, clients(company_name)').eq('id', out.quote_id).single();
    expect(q).toMatchObject({ status: 'Inquiry', created_by_email: actor.email });
    expect((q as any).clients.company_name).toBe(`Kumar Fabs ${tag}`);
    const { data: items } = await admin().from('quotation_items').select('item_code, quantity').eq('quotation_id', out.quote_id);
    expect(items).toEqual([{ item_code: code(), quantity: 120 }]);
    const { lead } = await (await get(request, `/api/leads/${rec!.id}`)).json();
    expect(lead).toMatchObject({ status: 'converted', qn: out.qn });
    expect((await post(request, `/api/leads/${rec!.id}`, { action: 'convert' })).status()).toBe(400);
  });

  test('statuses and owners are checked; converting is not a status anyone can set', async ({ request }) => {
    const { data: rec } = await admin().from('master_data').insert({
      tenant_id: actor.tenantId, category: 'lead', label: `Seeded two ${tag}`,
      metadata: { status: 'new', kind: 'enquiry', source: 'manual', from_email: 'x@e2e.test', contact: {}, summary: 's', requirements: [], score: 20, temperature: 'cold', score_reasons: [] },
    }).select('id').single();
    const patch = (data: any) => request.patch(`${ENV.baseUrl}/api/leads/${rec!.id}`, { headers: authed(token), data });
    expect((await patch({ status: 'converted' })).status()).toBe(400);
    expect((await patch({ owner_email: 'nobody@e2e-elsewhere.test' })).status()).toBe(400);
    const ok = await patch({ status: 'discarded', discarded_reason: 'Duplicate' });
    expect((await ok.json()).lead).toMatchObject({ status: 'discarded', discarded_reason: 'Duplicate' });
  });

  test('a new client email that matches no quote is read into a lead by itself', async ({ request }) => {
    test.setTimeout(150_000);
    const subject = `Price request ${tag}`;
    const res = await request.post(`${ENV.baseUrl}/api/inbound-email`, { headers: { ...protectionHeaders(), 'Content-Type': 'application/json' }, data: {
      type: 'email.received', data: { from: `anil@e2e-${tag}-buyer.test`, to: [`${actor.tenant.inbound_routing_id}@inbound.bloomgard.co`], subject, text: `Please quote 75 pcs of ${code()}. Thanks, Anil` },
    } });
    expect(res.status(), await res.text()).toBe(200);
    const row = await waitFor(async () => {
      const { data } = await admin().from('inbound_emails').select('id').eq('tenant_id', actor.tenantId).eq('subject', subject).maybeSingle();
      if (!data) return null;
      const { data: l } = await admin().from('master_data').select('metadata').eq('category', 'lead').contains('metadata', { email_id: data.id }).maybeSingle();
      return l ? { emailId: data.id, lead: l.metadata as any } : null;
    }, 90_000, 2000, 'lead captured from the inbound email');
    emails.push(row.emailId);
    expect(row.lead.kind).toBe('enquiry');
    expect(row.lead.requirements.some((r: any) => r.item_code === code() && r.quantity === 75)).toBe(true);
  });
});
