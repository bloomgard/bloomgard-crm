import { NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(process.env.RESEND_API_KEY);

const AI_API_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = 'openai/gpt-4o-mini';

export const maxDuration = 60;

/**
 * Resend signs webhooks the Svix way: HMAC-SHA256 over "id.timestamp.body" with the base64 key after "whsec_".
 * Enforced only when RESEND_WEBHOOK_SECRET is set, so local tests and older setups keep working.
 */
function signatureOk(raw: string, headers: Headers) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return true;
  const id = headers.get('svix-id'), ts = headers.get('svix-timestamp'), sig = headers.get('svix-signature');
  if (!id || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replayed or stale
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest();
  return sig.split(' ').some((part) => {
    const [, value] = part.split(',');
    const got = Buffer.from(value || '', 'base64');
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!signatureOk(raw, request.headers)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    const payload = JSON.parse(raw || '{}');
    // 2. Safely Extract fromAddress
    const fromAddress = payload.data?.from || '';
    if (!fromAddress) {
      return NextResponse.json({ message: 'No from address' }, { status: 200 });
    }

    // 2. Extract Routing ID
    const toAddress = payload.data?.to?.[0];
    if (!toAddress) {
      return NextResponse.json({ error: 'Missing to address' }, { status: 400 });
    }
    
    let exactEmail = toAddress;
    const emailMatch = toAddress.match(/<([^>]+)>/);
    if (emailMatch) {
      exactEmail = emailMatch[1];
    }
    
    exactEmail = exactEmail.toLowerCase().trim();
    const parsedTenantId = exactEmail.split('@')[0];
    
    console.log("PARSED TENANT ID:", parsedTenantId);

    // 3. Routing Lookup (User-level or Workspace-level)
    let tenantId = null;
    let agentId = null;
    let tenant = null;

    // First try: User-level forwarding
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, tenant_id')
      .ilike('inbound_email', exactEmail)
      .maybeSingle();

    if (profile) {
      tenantId = profile.tenant_id;
      agentId = profile.id;
    }

    // Second try: workspace-level routing (local-part matches a tenant routing id / slug)
    if (!tenantId && parsedTenantId) {
      const { data: routedTenant } = await supabase
        .from('tenants')
        .select('id')
        .or(`inbound_routing_id.eq.${parsedTenantId},routing_slug.eq.${parsedTenantId}`)
        .maybeSingle();
      if (routedTenant) tenantId = routedTenant.id;
    }

    // A workspace's own reply subdomain (reply.acme.com): any address on it belongs to that workspace
    const atDomain = exactEmail.split('@')[1] || '';
    if (!tenantId && atDomain) {
      const { data: byDomain } = await supabase.from('tenants').select('id')
        .eq('features_jsonb->email_domain->reply->>name', atDomain).limit(1);
      if (byDomain && byDomain.length) tenantId = byDomain[0].id;
    }

    // Third try: local-part is a raw tenant UUID
    if (!tenantId && /^[0-9a-f-]{36}$/i.test(parsedTenantId)) {
      const { data: uuidTenant } = await supabase
        .from('tenants').select('id').eq('id', parsedTenantId).maybeSingle();
      if (uuidTenant) tenantId = uuidTenant.id;
    }

    if (!tenantId) {
      console.error(`Tenant/Agent not found for email: ${exactEmail}`);
      return NextResponse.json({ error: 'Routing not found' }, { status: 400 });
    }

    const { data: tenantData } = await supabase
      .from('tenants')
      .select('id, company_name, ai_enabled')
      .eq('id', tenantId)
      .single();
    tenant = tenantData;
    if (!tenant) {
      console.error(`Tenant row missing for id: ${tenantId}`);
      return NextResponse.json({ error: 'Tenant not found' }, { status: 200 });
    }

    // Production and previews share one database and every Resend webhook receives every email, so the same
    // message can arrive more than once. A secondary receiver (previews: INBOUND_ROLE=secondary) gives the
    // primary a head start, and nobody files a Message-ID that is already stored.
    const incomingMessageId = payload.data?.message_id || '';
    if (process.env.INBOUND_ROLE === 'secondary') await new Promise((r) => setTimeout(r, 8000));
    if (incomingMessageId) {
      const { data: dup } = await supabase.from('inbound_emails').select('id')
        .eq('tenant_id', tenant.id).eq('message_id', incomingMessageId).limit(1);
      if (dup && dup.length) return NextResponse.json({ success: true, duplicate: true }, { status: 200 });
    }

    // 4. Fetch Full Email Body & Extract Threading Headers
    const emailId = payload.data?.email_id;
    let bodyText = payload.data?.text || '';
    let bodyHtml = payload.data?.html || '';
    let fullEmailObj: any = null;

    if (emailId) {
      const { data: fullEmail, error: fetchError } = await resend.emails.receiving.get(emailId);
      if (!fetchError && fullEmail) {
        fullEmailObj = fullEmail;
        bodyText = fullEmail.text || bodyText;
        bodyHtml = fullEmail.html || bodyHtml;
      }
    }

    // Extract thread ID
    let threadId = payload.data?.message_id || payload.data?.id || `msg_${Date.now()}`;
    
    if (fullEmailObj) {
      if (fullEmailObj.in_reply_to) {
        threadId = fullEmailObj.in_reply_to;
      } else if (fullEmailObj.headers) {
        if (Array.isArray(fullEmailObj.headers)) {
          const inReplyToHeader = fullEmailObj.headers.find((h: any) => h.name?.toLowerCase() === 'in-reply-to');
          if (inReplyToHeader) threadId = inReplyToHeader.value;
        } else if (typeof fullEmailObj.headers === 'object') {
          threadId = fullEmailObj.headers['In-Reply-To'] || fullEmailObj.headers['in-reply-to'] || threadId;
        }
      }
    }

    // Clean brackets from Message-IDs if present
    if (typeof threadId === 'string' && threadId.startsWith('<') && threadId.endsWith('>')) {
      threadId = threadId.slice(1, -1);
    }

    const clientEmail = payload.data.from;
    const clientMessage = bodyText || bodyHtml || 'No message body.';

    // 5. Database Insertion
    const { error: insertError } = await supabase
      .from('inbound_emails')
      .insert({
        tenant_id: tenant.id,
        sender_email: clientEmail,
        subject: payload.data.subject,
        body_text: bodyText,
        body_html: bodyHtml,
        message_id: payload.data.message_id || '',
        thread_id: threadId
      });

    if (insertError) {
      console.error('Error inserting inbound email:', insertError);
    }

    // --- SYNCHRONOUS LOGGING TO QUOTE ---
    // Moved to 'after()' so the webhook instantly returns 200 OK to Resend and avoids timeouts!
    after(async () => {

      const subjectLine = payload.data.subject || '';
      const qnMatch = subjectLine.match(/QN-\d{4}-\d{3}(?:-Rev-\d+)?/);
  
      // 1) The QN number in the subject is the strongest signal.
      // 2) Otherwise match the sender to a known client and use that client's latest quote.
      // 3) Otherwise this is a new enquiry: keep it in the inbox, attach it to nothing.
      let quote: any = null;
      if (qnMatch) {
        const { data } = await supabase.from('quotations').select('*')
          .eq('tenant_id', tenant.id).eq('qn_number', qnMatch[0]).limit(1);
        quote = data?.[0] || null;
      } else {
        const senderAddress = (String(clientEmail).match(/[^\s<>"']+@[^\s<>"']+/)?.[0] || '').toLowerCase();
        if (senderAddress) {
          const { data: clients } = await supabase.from('clients').select('id')
            .eq('tenant_id', tenant.id).ilike('email_id', `%${senderAddress}%`);
          if (clients && clients.length > 0) {
            const { data } = await supabase.from('quotations').select('*')
              .eq('tenant_id', tenant.id).in('client_id', clients.map((c: any) => c.id))
              .order('created_at', { ascending: false }).limit(1);
            quote = data?.[0] || null;
          }
        }
      }

      if (quote) {
        let customMetadata = quote.custom_metadata || {};
        let conversations = customMetadata.agent_conversations || [];
        conversations.push({ role: 'client', content: clientMessage, timestamp: new Date().toISOString() });
        customMetadata.agent_conversations = conversations;
  
        await supabase.from('quotations').update({ 
           custom_metadata: customMetadata, 
           last_contact_date: new Date().toISOString() 
        }).eq('id', quote.id);
        
        await supabase.from('status_logs').insert([{
           quotation_id: quote.id,
           old_status: quote.status,
           new_status: quote.status,
           comments: `Client replied via Email. Logged to conversation history.`
        }]);

        // Ensure a triage thread exists for this quote and mark it as needing attention.
        let threadRowId: string | null = null;
        const { data: existingThread } = await supabase
          .from('email_threads').select('id').eq('quote_id', quote.id).maybeSingle();
        if (existingThread) {
          threadRowId = existingThread.id;
          await supabase.from('email_threads')
            .update({ triage_status: 'incoming', ai_draft_text: null, last_updated: new Date().toISOString() })
            .eq('id', existingThread.id);
        } else {
          const { data: newThread } = await supabase.from('email_threads').insert({
            tenant_id: tenant.id,
            quote_id: quote.id,
            agent_id: agentId,
            triage_status: 'incoming',
            last_updated: new Date().toISOString(),
          }).select('id').single();
          threadRowId = newThread?.id || null;
        }

        // Generate an AI draft reply for human review (never auto-sent).
        if (tenant.ai_enabled) {
          const { processAiAutoReply } = require('@/lib/ai-reply');
          try {
            const res = await processAiAutoReply(threadId, tenant.id, agentId, quote.id, threadRowId);
            console.log('AI draft generation finished:', res);
          } catch (err) {
            console.error("AI draft generation failed:", err);
          }
        }
      }

      // automations and plugins hear about every client email, attached to a quote or not
      try {
        const { emit } = await import('@/lib/platform/events');
        await emit({ type: 'email.received', tenantId: tenant.id, quoteId: quote?.id || null, actorEmail: null,
          data: { from: clientEmail, subject: subjectLine, qn: quote?.qn_number || null, new_enquiry: !quote } });
      } catch (err) { console.error('email.received automations failed:', err); }
    });

    // Return 200 immediately on success, ensuring Resend doesn't retry
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
