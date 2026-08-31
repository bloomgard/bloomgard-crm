import { NextResponse, after } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(process.env.RESEND_API_KEY);

const AI_API_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = 'openai/gpt-4o-mini';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const payload = await request.json();
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
  
      let quoteQuery = supabase.from('quotations').select('*').eq('tenant_id', tenant.id);
      
      if (qnMatch) {
        quoteQuery = quoteQuery.eq('qn_number', qnMatch[0]);
      } else {
        quoteQuery = quoteQuery.order('created_at', { ascending: false });
      }
  
      const { data: quote } = await quoteQuery.limit(1).single();
  
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
            .update({ triage_status: 'incoming', last_updated: new Date().toISOString() })
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
    });

    // Return 200 immediately on success, ensuring Resend doesn't retry
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
