import { test, expect } from '@playwright/test';
import { admin, resolveActor, Actor, Cleanup, waitFor } from '../helpers/db';
import { ENV, protectionHeaders, runTag } from '../helpers/env';
import { deliverInbound, inboundRow } from '../helpers/email';
import { makeQuote, seedCatalogue, snapshotProfile, snapshotThreads, TestQuote } from '../helpers/fixtures';

/**
 * Email receiving and forwarding, end to end through the real webhook handler:
 * routing (workspace address, personal forwarding address, tenant id), filing to the
 * right quote, thread state, and the AI draft that must never be sent automatically.
 */
test.describe.serial('Inbound email: routing, capture and AI draft', () => {
  let actor: Actor;
  let tag: string;
  const cleanup = new Cleanup();
  let q1: TestQuote;
  const code = () => `E2E-${tag.toUpperCase()}-A`;
  const workspaceAddr = () => `${actor.tenant.inbound_routing_id}@inbound.bloomgard.co`;

  test.beforeAll(async ({ request }) => {
    actor = await resolveActor();
    tag = runTag();
    test.skip(!actor.tenant.ai_enabled, 'Workspace has AI disabled');
    await snapshotThreads(actor, cleanup);
    const prof = await snapshotProfile(actor, cleanup);
    await admin().from('profiles').update({ full_name: 'E2E Tester', job_title: 'QA Lead', phone: '+91 90000 00000', signature: null }).eq('id', actor.userId);
    await seedCatalogue(request, actor, cleanup, [[code(), `E2E Widget ${tag}`, 'PCS', '77.77']]);
    q1 = await makeQuote(actor, cleanup, `${tag}-1`, { withThread: 'outgoing' });
    void prof;
  });

  test.afterAll(async () => {
    if (actor) await admin().from('inbound_emails').delete().eq('tenant_id', actor.tenantId).like('subject', `%${tag}%`);
    await cleanup.run();
  });

  test('ignores a payload that has no sender', async ({ request }) => {
    const res = await request.post(`${ENV.baseUrl}/api/inbound-email`, {
      headers: protectionHeaders(), data: { type: 'email.received', data: { to: [workspaceAddr()], subject: 'x' } },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).message).toMatch(/no from/i);
  });

  test('rejects a payload that has no recipient', async ({ request }) => {
    const res = await request.post(`${ENV.baseUrl}/api/inbound-email`, {
      headers: protectionHeaders(), data: { type: 'email.received', data: { from: 'a@b.test', subject: 'x' } },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects an address that belongs to no workspace', async ({ request }) => {
    const { res } = await deliverInbound(request, {
      to: `nobody-${tag}@inbound.bloomgard.co`, from: 'a@b.test', subject: `Routing ${tag}`, text: 'hello',
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toMatch(/routing not found/i);
  });

  test('workspace address: stored, filed under the quote, thread flips to incoming and the stale draft is cleared', async ({ request }) => {
    // an old draft from the previous client message must never survive a new inbound email
    await admin().from('email_threads').update({ ai_draft_text: 'STALE-DRAFT' }).eq('quote_id', q1.id);

    const subject = `Re: Following up on Quote ${q1.qn} ${tag}`;
    const from = `Priya Nair <priya-${tag}@e2e-buyer.test>`;
    const { res } = await deliverInbound(request, {
      to: workspaceAddr(), from, subject,
      text: `Thanks for the quote. What is the unit rate for ${code()}, and how soon can you deliver 200 pieces to Pune?`,
    });
    expect(res.status()).toBe(200);

    const row = await inboundRow(subject, actor.tenantId);
    expect(row.sender_email).toContain(`priya-${tag}@e2e-buyer.test`);
    expect(row.body_text).toContain(code());

    const convo = await waitFor(async () => {
      const { data } = await admin().from('quotations').select('custom_metadata').eq('id', q1.id).single();
      const list = (data?.custom_metadata as any)?.agent_conversations || [];
      return list.find((m: any) => m.role === 'client' && m.content.includes(code()));
    }, 30_000, 1000, 'client message logged to the quote');
    expect(convo).toBeTruthy();

    const thread = await waitFor(async () => {
      const { data } = await admin().from('email_threads').select('*').eq('quote_id', q1.id).maybeSingle();
      return data?.triage_status === 'incoming' ? data : null;
    }, 30_000, 1000, 'thread to become incoming');
    expect(thread.ai_draft_text).not.toBe('STALE-DRAFT');
  });

  test('accepts display-name and upper-case recipient formats', async ({ request }) => {
    const subject = `Format check ${tag}`;
    const { res } = await deliverInbound(request, {
      to: `"Bloomgard Inbound" <${workspaceAddr().toUpperCase()}>`, from: `fmt-${tag}@e2e-buyer.test`,
      subject, text: 'format only',
    });
    expect(res.status()).toBe(200);
    expect((await inboundRow(subject, actor.tenantId)).tenant_id).toBe(actor.tenantId);
  });

  test('personal forwarding address routes to the owner and assigns the agent', async ({ request }) => {
    test.setTimeout(150_000);
    const fwd = `e2e-fwd-${tag}@inbound.bloomgard.co`;
    await admin().from('profiles').update({ inbound_email: fwd }).eq('id', actor.userId);
    const q2 = await makeQuote(actor, cleanup, `${tag}-2`);
    const subject = `Re: Quote ${q2.qn} ${tag} fwd`;
    const { res } = await deliverInbound(request, {
      to: fwd, from: `fwd-${tag}@e2e-buyer.test`, subject, text: `Please confirm ${code()} price.`,
    });
    expect(res.status()).toBe(200);
    expect((await inboundRow(subject, actor.tenantId)).tenant_id).toBe(actor.tenantId);
    const thread = await waitFor(async () => {
      const { data } = await admin().from('email_threads').select('*').eq('quote_id', q2.id).maybeSingle();
      return data;
    }, 30_000, 1000, 'thread created for forwarded mail');
    expect(thread.agent_id).toBe(actor.userId);
    expect(thread.triage_status).toBe('incoming');
  });

  test('a raw workspace id as the local part also routes', async ({ request }) => {
    const subject = `Uuid route ${tag}`;
    const { res } = await deliverInbound(request, {
      to: `${actor.tenantId}@inbound.bloomgard.co`, from: `uuid-${tag}@e2e-buyer.test`, subject, text: 'uuid',
    });
    expect(res.status()).toBe(200);
    expect((await inboundRow(subject, actor.tenantId)).tenant_id).toBe(actor.tenantId);
  });

  test('a reply with no QN is matched to that sender\'s latest quote, not to an unrelated one', async ({ request }) => {
    test.setTimeout(150_000);
    const buyer = `known-${tag}@e2e-client.test`;
    const q3 = await makeQuote(actor, cleanup, `${tag}-3`, { clientEmail: buyer });
    const subject = `Question about pricing ${tag}`;
    const { res } = await deliverInbound(request, { to: workspaceAddr(), from: `Known Buyer <${buyer}>`, subject, text: `Is ${code()} in stock?` });
    expect(res.status()).toBe(200);
    await inboundRow(subject, actor.tenantId);
    const thread = await waitFor(async () => {
      const { data } = await admin().from('email_threads').select('*').eq('quote_id', q3.id).maybeSingle();
      return data;
    }, 30_000, 1000, 'thread for the sender\'s own quote');
    expect(thread.triage_status).toBe('incoming');
  });

  test('an enquiry from an unknown sender is kept in the inbox and attached to no quote', async ({ request }) => {
    const { count: before } = await admin().from('email_threads').select('id', { count: 'exact', head: true }).eq('tenant_id', actor.tenantId);
    const subject = `Cold enquiry ${tag}`;
    const { res } = await deliverInbound(request, {
      to: workspaceAddr(), from: `stranger-${tag}@e2e-nobody.test`, subject, text: 'We would like a quote for boxes.',
    });
    expect(res.status()).toBe(200);
    await inboundRow(subject, actor.tenantId);
    await new Promise((r) => setTimeout(r, 6000)); // give the background step time to (wrongly) attach it
    const { count: after } = await admin().from('email_threads').select('id', { count: 'exact', head: true }).eq('tenant_id', actor.tenantId);
    expect(after).toBe(before);
  });

  test('the AI draft is grounded in Master Data, signed as the agent, and never sent', async () => {
    test.setTimeout(150_000);
    const thread = await waitFor(async () => {
      const { data } = await admin().from('email_threads').select('*').eq('quote_id', q1.id).maybeSingle();
      return data?.ai_draft_text ? data : null;
    }, 100_000, 2000, 'AI draft on the thread');
    const draft: string = thread.ai_draft_text;
    expect(draft).toContain('77.77');                                      // real rate from Master Data
    expect(draft).not.toMatch(/\[(your|name|position|company|contact)/i);  // no placeholder brackets
    expect(draft).toContain('E2E Tester');                                 // signed with the agent's profile

    const { count } = await admin().from('sent_emails').select('id', { count: 'exact', head: true })
      .eq('tenant_id', actor.tenantId).ilike('recipient', `%priya-${tag}@e2e-buyer.test%`);
    expect(count).toBe(0);                                                 // drafted only, nothing went out
  });

});
