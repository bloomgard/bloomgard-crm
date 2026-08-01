import { NextResponse } from 'next/server';
import { getDynamicSender, sendEmail } from '@/lib/postal';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Define headers that allow Android WebView to communicate with the server
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};

// 1. The Preflight Handler (Android needs this)
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { to, cc, bcc, subject, message, attachments, agentEmail, agentId, senderPreference, tenantId, companyName, customSender, provider } = body;

    if (!to || !subject || !message) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }

    // Fetch Agent Details
    let agent = null;
    if (agentId) {
      const { data } = await supabase.from('profiles').select('email, full_name, inbound_email').eq('id', agentId).single();
      agent = data;
    }

    // Extract domain from user email if tenant domain not explicitly passed
    const tenantDomain = agentEmail ? agentEmail.split('@')[1] : undefined;
    let fromString = getDynamicSender(companyName, customSender, tenantDomain);

    if (senderPreference === 'personal' && agent && agent.email && tenantDomain && agent.email.endsWith(`@${tenantDomain}`)) {
      fromString = `${agent.full_name || 'Agent'} <${agent.email}>`;
    }

    const formattedAttachments = attachments?.map((att: any) => {
      const base64Data = att.base64.includes(',') ? att.base64.split(',')[1] : att.base64;
      return {
        filename: att.filename,
        content: Buffer.from(base64Data, 'base64')
      };
    }) || [];

    let replyToAddress = agentEmail;
    if (tenantId) {
      const { data: tenant } = await supabase.from('tenants').select('inbound_routing_id').eq('id', tenantId).single();
      if (tenant?.inbound_routing_id) {
        replyToAddress = `${tenant.inbound_routing_id}@inbound.bloomgard.co`;
      } else {
        replyToAddress = `${tenantId}@inbound.bloomgard.co`;
      }
    }

    if (agent && agent.inbound_email) {
      replyToAddress = agent.inbound_email;
    }

    const emailPayload: any = {
      from: fromString,
      to: to.split(',').map((s: string)=>s.trim()),
      replyTo: replyToAddress,
      subject: subject,
      text: message, 
      attachments: formattedAttachments,
    };
    
    if (cc && cc.trim()) emailPayload.cc = cc.split(',').map((s: string)=>s.trim());
    if (bcc && bcc.trim()) emailPayload.bcc = bcc.split(',').map((s: string)=>s.trim());

    let data;
    try {
      data = await sendEmail(emailPayload);
      
      // Log Email Usage
      if (data && tenantId) {
        const { logEmailSent } = await import('@/utils/usageLogger');
        await logEmailSent(tenantId, to, subject);
      }
      
    } catch (sendError: any) {
      console.error('Email Delivery Error:', sendError);
      return NextResponse.json({ success: false, error: sendError.message || 'Failed to send email' }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json({ success: true, data }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('Server Crash:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}