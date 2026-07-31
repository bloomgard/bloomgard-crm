import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDynamicSender, sendEmail } from '@/lib/postal';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { threadId, quoteId, tenantId, agentId, message } = body;

    if (!threadId || !quoteId || !tenantId || !message) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const { data: quote, error: quoteError } = await supabase
      .from('quotations')
      .select(`*, clients (*)`)
      .eq('id', quoteId)
      .eq('tenant_id', tenantId)
      .single();

    if (quoteError || !quote) {
      throw new Error(`Failed to fetch quote context: ${quoteError?.message || 'Not found'}`);
    }

    let clientEmail = quote.client_email || quote.clients?.email || quote.clients?.email_id || quote.custom_metadata?.client_email || quote.custom_metadata?.email_id || quote.custom_metadata?.['Client Information']?.email;

    if (!clientEmail) {
      // Fallback: Check if we have received any inbound emails for this quote
      const { data: inboundEmails } = await supabase
        .from('inbound_emails')
        .select('sender_email')
        .ilike('subject', `%${quote.qn_number}%`)
        .order('created_at', { ascending: false })
        .limit(1);

      if (inboundEmails && inboundEmails.length > 0) {
        clientEmail = inboundEmails[0].sender_email;
      }
    }

    if (!clientEmail) {
      throw new Error('No email address found for this client. Cannot send reply.');
    }

    const { data: tenantData } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    const tenantDomain = tenantData?.website ? new URL(tenantData.website).hostname.replace('www.', '') : undefined;
    
    // Fetch Agent Details
    let agent = null;
    if (agentId) {
      const { data } = await supabase.from('profiles').select('email, full_name, inbound_email').eq('id', agentId).single();
      agent = data;
    }

    // Determine From Address
    let fromString = getDynamicSender(tenantData?.company_name, tenantData?.custom_email_sender, tenantDomain);
    if (agent && agent.email && tenantDomain && agent.email.endsWith(`@${tenantDomain}`)) {
      fromString = `${agent.full_name || 'Agent'} <${agent.email}>`;
    }

    // Determine Reply-To
    let replyTo = tenantData?.inbound_routing_id ? `${tenantData.inbound_routing_id}@inbound.bloomgard.co` : `${tenantId}@inbound.bloomgard.co`;
    if (agent && agent.inbound_email) {
      replyTo = agent.inbound_email;
    }

    const mailOptions = {
      from: fromString,
      to: clientEmail,
      replyTo: replyTo,
      subject: `Re: Following up on Quote ${quote.qn_number}`,
      html: message.replace(/\n/g, '<br/>')
    };

    const sentData = await sendEmail(mailOptions);
    
    if (sentData) {
      const { logEmailSent } = await import('@/utils/usageLogger');
      await logEmailSent(tenantId, clientEmail, mailOptions.subject);
    }
    
    const now = new Date().toISOString();

    let meta = quote.custom_metadata;
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch (e) { meta = {}; } }
    if (!meta) meta = {};
    if (!meta.agent_conversations) meta.agent_conversations = [];

    meta.agent_conversations.push({
      role: 'agent',
      content: message,
      timestamp: now
    });

    await supabase.from('quotations').update({ follow_up_status: 'Manual Reply Sent', last_contact_date: now, custom_metadata: meta }).eq('id', quoteId);
    await supabase.from('status_logs').insert([{ quotation_id: quoteId, old_status: quote.status, new_status: quote.status, comments: `Manual reply sent in Triage UI.` }]);

    // Update the email thread triage state
    await supabase.from('email_threads').update({
      triage_status: 'outgoing',
      ai_draft_text: null,
      last_updated: now
    }).eq('id', threadId);

    return NextResponse.json({ success: true, message: 'Reply sent successfully' });

  } catch (error: any) {
    console.error('Agent Manual Reply Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
