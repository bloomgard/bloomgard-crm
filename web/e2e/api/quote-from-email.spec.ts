import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup } from '../helpers/db';
import { ENV, protectionHeaders, runTag } from '../helpers/env';
import { seedCatalogue } from '../helpers/fixtures';

/** One-click quote from an enquiry email: client creation, numbering, and Master Data enrichment of line items. */
test.describe.serial('Quote from an enquiry email', () => {
  let actor: Actor;
  let tag: string;
  const cleanup = new Cleanup();
  const code = () => `E2E-${tag.toUpperCase()}-Q`;
  const post = (request: any, data: any) =>
    request.post(`${ENV.baseUrl}/api/quote-from-email`, { headers: protectionHeaders(), data });

  test.beforeAll(async ({ request }) => {
    actor = await resolveActor(); tag = runTag();
    // two products share the unit "BOX" with different rates: the unit must not be resolved by text alone
    await seedCatalogue(request, actor, cleanup, [
      [code(), `E2E Gasket ${tag}`, 'BOX', '12.50'],
      [`${code()}2`, `E2E Washer ${tag}`, 'BOX', '99.00'],
    ]);
  });
  test.afterAll(async () => cleanup.run());

  test('needs a workspace and an analysis', async ({ request }) => {
    expect((await post(request, { analysis: { lead_gen_quote: {} } })).status()).toBe(400);
    expect((await post(request, { tenantId: actor.tenantId })).status()).toBe(400);
  });

  test('creates the quotation, client and thread, and fills line items from Master Data', async ({ request }) => {
    const sender = `Sunil Rao <sunil@acme-${tag}.example>`;
    const { data: inbound } = await admin().from('inbound_emails').insert({
      tenant_id: actor.tenantId, sender_email: sender, subject: `Enquiry ${tag}`, body_text: 'Need gaskets',
      thread_id: `e2e-${tag}`, message_id: `e2e-${tag}`,
    }).select('id').single();
    cleanup.delete('inbound_emails', 'id', inbound!.id);

    const res = await post(request, {
      tenantId: actor.tenantId, emailId: inbound!.id, agentEmail: actor.email,
      analysis: {
        summary: 'E2E enquiry',
        lead_gen_quote: {
          'Client Information': [{ contact_person: '', email_id: '' }],
          'Products': [
            { item_code: code(), quantity: 40, item_name: '', uom: '', item_rate: '' },
            { item_name: 'Something not in the catalogue', quantity: 3 },
          ],
        },
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body.qn_number).toMatch(/^QN-\d{4}-\d{3,}$/);
    expect(body.itemCount).toBe(2);

    const { data: q } = await admin().from('quotations').select('*').eq('id', body.quoteId).single();
    cleanup.add(async () => {
      await admin().from('status_logs').delete().eq('quotation_id', body.quoteId);
      await admin().from('email_threads').delete().eq('quote_id', body.quoteId);
      await admin().from('quotation_items').delete().eq('quotation_id', body.quoteId);
      await admin().from('quotations').delete().eq('id', body.quoteId);
      if (q?.client_id) await admin().from('clients').delete().eq('id', q.client_id);
    });
    expect(q!.status).toBe('Inquiry');
    expect(q!.created_by_email).toBe(actor.email);
    expect(q!.custom_metadata.source).toBe('inbound_email');
    const due = new Date(q!.follow_up_due_date).getTime() - Date.now();
    expect(due).toBeGreaterThan(1.5 * 86400000);                          // follow-up scheduled about 3 days out
    expect(due).toBeLessThan(4.5 * 86400000);

    // client derived from the sender, not left as "Unknown Client"
    const { data: client } = await admin().from('clients').select('*').eq('id', q!.client_id).single();
    expect(client!.company_name).toMatch(new RegExp(`^Acme E2e`, 'i'));
    expect(client!.email_id).toContain(`sunil@acme-${tag}.example`);
    expect(client!.contact_person).toBe('Sunil Rao');

    // line items: the catalogue row is filled in completely, the unknown one is kept as typed
    const { data: items } = await admin().from('quotation_items').select('*').eq('quotation_id', body.quoteId).order('display_order');
    expect(items![0]).toMatchObject({ item_code: code(), item_name: `E2E Gasket ${tag}`, uom: 'BOX', quantity: 40 });
    expect(Number(items![0].item_rate)).toBeCloseTo(12.5);
    expect(items![1].item_name).toBe('Something not in the catalogue');
    expect(Number(items![1].item_rate)).toBe(0);

    const { data: thread } = await admin().from('email_threads').select('triage_status').eq('quote_id', body.quoteId).single();
    expect(thread!.triage_status).toBe('incoming');
    const { data: logs } = await admin().from('status_logs').select('comments').eq('quotation_id', body.quoteId);
    expect((logs || []).some((l) => /auto-created from inbound email/i.test(l.comments))).toBe(true);
  });

  test('numbers each new quote after the highest existing one', async ({ request }) => {
    const mk = async () => {
      const r = await post(request, {
        tenantId: actor.tenantId, agentEmail: actor.email,
        analysis: { lead_gen_quote: { 'Client Information': [{ client_name: `E2E Co ${tag} num`, email_id: `n-${tag}@e2e-num.test` }], 'Products': [{ item_name: 'x', quantity: 1 }] } },
      });
      const j = await r.json();
      cleanup.add(async () => {
        const { data: qq } = await admin().from('quotations').select('client_id').eq('id', j.quoteId).single();
        await admin().from('status_logs').delete().eq('quotation_id', j.quoteId);
        await admin().from('email_threads').delete().eq('quote_id', j.quoteId);
        await admin().from('quotation_items').delete().eq('quotation_id', j.quoteId);
        await admin().from('quotations').delete().eq('id', j.quoteId);
        if (qq?.client_id) await admin().from('clients').delete().eq('id', qq.client_id);
      });
      return Number(j.qn_number.split('-')[2]);
    };
    const n1 = await mk();
    const n2 = await mk();
    expect(n2).toBe(n1 + 1);
  });

  test('a repeated unit resolves to the product it belongs to, not the first product that uses it', async ({ request }) => {
    const res = await post(request, {
      tenantId: actor.tenantId, agentEmail: actor.email,
      analysis: { lead_gen_quote: {
        'Client Information': [{ client_name: `E2E Co ${tag} amb`, email_id: `amb-${tag}@e2e-amb.test` }],
        'Products': [{ item_code: `${code()}2`, uom: 'BOX', quantity: 2 }],
      } },
    });
    const body = await res.json();
    const { data: q } = await admin().from('quotations').select('client_id').eq('id', body.quoteId).single();
    cleanup.add(async () => {
      await admin().from('status_logs').delete().eq('quotation_id', body.quoteId);
      await admin().from('email_threads').delete().eq('quote_id', body.quoteId);
      await admin().from('quotation_items').delete().eq('quotation_id', body.quoteId);
      await admin().from('quotations').delete().eq('id', body.quoteId);
      if (q?.client_id) await admin().from('clients').delete().eq('id', q.client_id);
    });
    const { data: items } = await admin().from('quotation_items').select('item_name, uom, item_rate').eq('quotation_id', body.quoteId);
    expect(items![0].item_name).toBe(`E2E Washer ${tag}`);
    expect(Number(items![0].item_rate)).toBeCloseTo(99);
  });

  test('a product named only by its description still gets its code, unit and rate', async ({ request }) => {
    const res = await post(request, {
      tenantId: actor.tenantId, agentEmail: actor.email,
      analysis: { lead_gen_quote: {
        'Client Information': [{ client_name: `E2E Co ${tag} nm`, email_id: `nm-${tag}@e2e-nm.test` }],
        'Products': [{ item_name: `E2E Gasket ${tag}`, quantity: 1 }],
      } },
    });
    const body = await res.json();
    const { data: q } = await admin().from('quotations').select('client_id').eq('id', body.quoteId).single();
    cleanup.add(async () => {
      await admin().from('status_logs').delete().eq('quotation_id', body.quoteId);
      await admin().from('email_threads').delete().eq('quote_id', body.quoteId);
      await admin().from('quotation_items').delete().eq('quotation_id', body.quoteId);
      await admin().from('quotations').delete().eq('id', body.quoteId);
      if (q?.client_id) await admin().from('clients').delete().eq('id', q.client_id);
    });
    const { data: items } = await admin().from('quotation_items').select('item_code, uom, item_rate').eq('quotation_id', body.quoteId);
    expect(items![0].item_code).toBe(code());
    expect(items![0].uom).toBe('BOX');
    expect(Number(items![0].item_rate)).toBeCloseTo(12.5);
  });
});
