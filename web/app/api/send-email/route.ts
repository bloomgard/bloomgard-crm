import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';

// Environment Variables Only
const resend = new Resend(process.env.RESEND_API_KEY);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Define headers that allow Android WebView/cross-origin to communicate with the server
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
};

// The Preflight Handler
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      to, 
      cc, 
      bcc, 
      subject, 
      message, 
      html,
      attachments, 
      tenantId, 
      companyName, 
      customSender,
      inReplyTo,
      references
    } = body;

    if (!to || !subject || (!message && !html)) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400, headers: corsHeaders });
    }

    // 1. Fix the 'From' Address: strictly use the verified domain email address provided by the frontend payload
    const fromName = companyName || 'Bloomgard Support';
    const fromEmail = customSender || 'support@bloomgard.co';
    const fromString = `${fromName} <${fromEmail}>`;

    // 2. Add 'Reply-To': dynamic inbound routing address (from settings/slug)
    let replyToAddress = undefined;
    if (body.routingSlug) {
      replyToAddress = `${body.routingSlug}@inbound.bloomgard.co`;
    } else if (tenantId) {
      const { data: tenant } = await supabase.from('tenants').select('inbound_routing_id').eq('id', tenantId).single();
      if (tenant?.inbound_routing_id) {
        replyToAddress = `${tenant.inbound_routing_id}@inbound.bloomgard.co`;
      } else {
        replyToAddress = `${tenantId}@inbound.bloomgard.co`; // Fallback
      }
    }

    // 3. Maintain Threading: Ensure the headers object containing In-Reply-To and References is preserved
    let headers: any = {};
    if (inReplyTo) headers['In-Reply-To'] = inReplyTo;
    if (references) headers['References'] = references;

    // Format attachments
    const formattedAttachments = attachments?.map((att: any) => {
      const base64Data = att.base64.includes(',') ? att.base64.split(',')[1] : att.base64;
      return {
        filename: att.filename,
        content: Buffer.from(base64Data, 'base64')
      };
    }) || [];

    const emailPayload: any = {
      from: fromString,
      to: typeof to === 'string' ? to.split(',').map((s: string) => s.trim()) : to,
      reply_to: replyToAddress, // Sets dynamic inbound routing address
      subject: subject,
      text: message,
      html: html,
      attachments: formattedAttachments,
      headers: Object.keys(headers).length > 0 ? headers : undefined
    };
    
    if (cc && cc.trim()) emailPayload.cc = cc.split(',').map((s: string) => s.trim());
    if (bcc && bcc.trim()) emailPayload.bcc = bcc.split(',').map((s: string) => s.trim());

    // Send using Resend natively
    const { data, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error('Email Delivery Error:', error);
      return NextResponse.json({ success: false, error: error.message || 'Failed to send email' }, { status: 400, headers: corsHeaders });
    }

    return NextResponse.json({ success: true, data }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error('Server Crash:', error);
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500, headers: corsHeaders });
  }
}
