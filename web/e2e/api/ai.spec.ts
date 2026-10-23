import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup, waitFor } from '../helpers/db';
import { ENV, protectionHeaders, runTag, DUMMY_RECIPIENT } from '../helpers/env';
import { resendStatus } from '../helpers/email';
import { makeQuote, seedCatalogue, snapshotProfile, snapshotThreads } from '../helpers/fixtures';

/**
 * Everything that calls the AI: enquiry analysis, grounded drafting, follow-up dispatch and the copilot.
 * Assertions are deliberately about facts (rates, signatures, honesty), not exact wording.
 */
test.describe.serial('AI features', () => {
  let actor: Actor;
  let tag: string;
  const cleanup = new Cleanup();
  const code = () => `E2E-${tag.toUpperCase()}-AI`;
  const tokensUsed = async (feature: string) => {
    const { data } = await admin().from('tenant_token_usage').select('total_tokens').eq('tenant_id', actor.tenantId).eq('feature_name', feature);
    return (data || []).reduce((n, r) => n + Number(r.total_tokens || 0), 0);
  };

  test.beforeAll(async ({ request }) => {
    actor = await resolveActor(); tag = runTag();
    await snapshotThreads(actor, cleanup);
    await snapshotProfile(actor, cleanup);
    await admin().from('profiles').update({ full_name: 'E2E Tester', job_title: 'QA Lead', phone: null, signature: null }).eq('id', actor.userId);
    await seedCatalogue(request, actor, cleanup, [[code(), `E2E Sprocket ${tag}`, 'PCS', '41.25']]);
  });
  test.afterAll(async () => {
    await admin().from('inbound_emails').delete().eq('tenant_id', actor.tenantId).like('subject', `%${tag}%`);
    await admin().from('sent_emails').delete().eq('tenant_id', actor.tenantId).like('subject', `%${tag}%`);
    await cleanup.run();
  });

  test('analyze-email extracts the client and resolves the product against Master Data', async ({ request }) => {
    test.setTimeout(120_000);
    const { data: schema } = await admin().from('tenant_schemas').select('schema_config').eq('tenant_id', actor.tenantId).single();
    const blueprint = (schema!.schema_config as any[]).filter((s) => !s.is_ai_settings && !s.is_agent_config && !s.is_branding && !['system_agents', 'branding_settings'].includes(s.title));
    const before = await tokensUsed('analyze-email');
    const res = await request.post(`${ENV.baseUrl}/api/ai/analyze-email`, {
      headers: protectionHeaders(),
      data: {
        blueprint, companyName: actor.tenant.company_name, agent: { name: 'E2E Tester', title: 'QA Lead' },
        email: {
          tenant_id: actor.tenantId, sender_email: `buyer-${tag}@e2e-acme.test`, subject: `Enquiry ${tag}`,
          body_text: `Hello, please quote 300 pieces of ${code()}. Contact: Meera Shah, buyer-${tag}@e2e-acme.test. Thanks, Meera`,
        },
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const { data } = await res.json();
    expect(typeof data.summary).toBe('string');
    expect(data.auto_reply).not.toMatch(/\[(your|name|position|company)/i);
    const products = JSON.stringify(data.lead_gen_quote);
    expect(products).toContain(code());
    expect(products).toMatch(/300/);
    await waitFor(async () => (await tokensUsed('analyze-email')) > before, 15_000, 1000, 'token usage logged for analyze-email');
  });

  test('analyze-email refuses to invent a price for a product that is not in the catalogue', async ({ request }) => {
    test.setTimeout(120_000);
    const res = await request.post(`${ENV.baseUrl}/api/ai/analyze-email`, {
      headers: protectionHeaders(),
      data: {
        blueprint: [], companyName: actor.tenant.company_name, agent: { name: 'E2E Tester', title: 'QA Lead' },
        email: { tenant_id: actor.tenantId, sender_email: `q-${tag}@e2e-acme.test`, subject: `Enquiry ${tag} 2`, body_text: 'How much is your quantum flux capacitor model ZX-9? Please quote 5 units.' },
      },
    });
    expect(res.status()).toBe(200);
    const reply: string = (await res.json()).data.auto_reply;
    expect(reply).not.toMatch(/(₹|rs\.?|inr|\$)\s?\d/i);                    // no made-up price
    expect(reply).toMatch(/confirm|check|follow|get back|let you know|not (currently )?(list|available|stock)|do not (sell|offer|manufacture)/i);
  });

  test('a drafted reply is grounded, signed as the agent and not sent', async ({ request }) => {
    test.setTimeout(180_000);
    const q = await makeQuote(actor, cleanup, `${tag}-ai`, { withThread: 'outgoing' });
    const subject = `Re: Quote ${q.qn} ${tag}`;
    const { deliverInbound, inboundRow } = await import('../helpers/email');
    const { res } = await deliverInbound(request, {
      to: `${actor.tenant.inbound_routing_id}@inbound.bloomgard.co`, from: `Meera Shah <meera-${tag}@e2e-acme.test>`, subject,
      text: `What is the rate for ${code()}? Also, do you make waterproof tarpaulin sheets, and what do they cost?`,
    });
    expect(res.status()).toBe(200);
    await inboundRow(subject, actor.tenantId);
    const thread = await waitFor(async () => {
      const { data } = await admin().from('email_threads').select('*').eq('quote_id', q.id).maybeSingle();
      return data?.ai_draft_text ? data : null;
    }, 120_000, 2000, 'AI draft');
    const draft: string = thread.ai_draft_text;
    expect(draft).toContain('41.25');                                        // real rate
    expect(draft).toContain('E2E Tester');                                   // identity from the profile
    expect(draft).not.toMatch(/\[(your|name|position|company|contact)/i);
    expect(draft).toMatch(/confirm|check|follow|get back|do not (make|manufacture|sell|offer)|not (currently )?(list|available)/i); // honest about tarpaulin
    const { count } = await admin().from('sent_emails').select('id', { count: 'exact', head: true }).eq('tenant_id', actor.tenantId).ilike('recipient', `%meera-${tag}@e2e-acme.test%`);
    expect(count).toBe(0);
  });

  test('ai-auto-reply regenerates a draft for a stored thread', async ({ request }) => {
    test.setTimeout(150_000);
    const q = await makeQuote(actor, cleanup, `${tag}-re`, { withThread: 'incoming' });
    const messageId = `regen-${tag}`;
    const subject = `Re: Quote ${q.qn} ${tag} regen`;
    await admin().from('inbound_emails').insert({
      tenant_id: actor.tenantId, thread_id: messageId, message_id: messageId, sender_email: `regen-${tag}@e2e-acme.test`,
      subject, body_text: `Please confirm the rate for ${code()}.`,
    });
    const res = await request.post(`${ENV.baseUrl}/api/ai-auto-reply`, { headers: protectionHeaders(), data: { threadId: messageId, tenantId: actor.tenantId } });
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  test('approving an AI follow-up sends it, threads the reply-to and updates the quote', async ({ request }) => {
    test.setTimeout(150_000);
    const q = await makeQuote(actor, cleanup, `${tag}-fu`, { items: [{ item_code: code(), item_name: `E2E Sprocket ${tag}`, quantity: 5, uom: 'PCS', item_rate: 41.25 }] });
    const res = await request.post(`${ENV.baseUrl}/api/trigger-agent`, {
      headers: protectionHeaders(), data: { quoteId: q.id, tenantId: actor.tenantId, agentEmail: actor.email, agentId: actor.userId },
    });
    expect(res.status(), await res.text()).toBe(200);
    const { data: quote } = await admin().from('quotations').select('follow_up_status, custom_metadata').eq('id', q.id).single();
    expect(quote!.follow_up_status).toBe('Agent Dispatched');
    const convo = ((quote!.custom_metadata as any).agent_conversations || []);
    expect(convo.some((m: any) => m.role === 'agent' && m.content.length > 20)).toBe(true);
    const { data: sent } = await admin().from('sent_emails').select('recipient, subject').eq('tenant_id', actor.tenantId).eq('subject', `Following up on Quote ${q.qn}`);
    expect(sent!.length).toBe(1);
    expect(sent![0].recipient).toBe(DUMMY_RECIPIENT);
  });

  test('trigger-agent needs a quote and a workspace', async ({ request }) => {
    const r = await request.post(`${ENV.baseUrl}/api/trigger-agent`, { headers: protectionHeaders(), data: {} });
    expect(r.status()).toBe(400);
  });

  test('copilot answers a question about the workspace and logs token usage', async ({ request }) => {
    test.setTimeout(120_000);
    const before = await tokensUsed('ask-ai');
    const res = await request.post(`${ENV.baseUrl}/api/ask-ai`, {
      headers: protectionHeaders(),
      data: { query: 'How many quotes are listed in the context?', context: { quotes: [{ qn: 'A' }, { qn: 'B' }, { qn: 'C' }] }, tenantId: actor.tenantId, userId: actor.userId },
    });
    expect(res.status()).toBe(200);
    const { answer } = await res.json();
    expect(answer).toMatch(/3|three/i);
    await waitFor(async () => (await tokensUsed('ask-ai')) > before, 15_000, 1000, 'token usage logged for ask-ai');
  });
});
