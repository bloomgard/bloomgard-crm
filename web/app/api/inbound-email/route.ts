import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key'; 
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    
    // 1. Parse Payload: Resend webhooks wrap the data in a `data` object
    const emailData = payload.type === 'email.received' && payload.data ? payload.data : payload;
    
    // Handle cases where 'to' might be an array or string
    const toAddress = Array.isArray(emailData.to) ? emailData.to[0] : emailData.to;
    const fromAddress = emailData.from || '';
    const subject = emailData.subject || '';
    const textBody = emailData.text || '';
    const htmlBody = emailData.html || '';

    if (!toAddress) {
      return NextResponse.json({ error: 'Missing to address' }, { status: 400 });
    }

    // 2. Extract Tenant ID (Routing ID)
    // e.g. "jeevan@inbound.bloomgard.co" -> "jeevan"
    const routingId = toAddress.split('@')[0];

    // 3. Database Lookup
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('inbound_routing_id', routingId)
      .single();

    if (tenantError || !tenant) {
      console.error(`Tenant not found for routing ID: ${routingId}`);
      // Returning 200 even on failure prevents Resend from endlessly retrying bad addresses
      return NextResponse.json({ error: 'Tenant not found' }, { status: 200 });
    }

    const tenantId = tenant.id;

    // 4. The Google Verification Trap (CRITICAL)
    const fromLower = fromAddress.toLowerCase();
    const isVerificationEmail = 
      fromLower.includes('forwarding-noreply@google.com') || 
      fromLower.includes('microsoft');

    if (isVerificationEmail) {
      const { error: trapError } = await supabase
        .from('inbound_emails')
        .insert({
          tenant_id: tenantId,
          sender_email: 'SYSTEM',
          subject: subject,
          body_text: textBody,
          body_html: htmlBody,
          status: 'ACTION_REQUIRED',
          is_read: false
        });
      
      if (trapError) console.error('Error saving verification trap:', trapError);
      return NextResponse.json({ success: true, message: 'Verification email trapped' }, { status: 200 });
    }

    // 5. Save Client Emails
    const { error: insertError } = await supabase
      .from('inbound_emails')
      .insert({
        tenant_id: tenantId,
        sender_email: fromAddress,
        subject: subject,
        body_text: textBody,
        body_html: htmlBody,
        is_read: false
      });

    if (insertError) {
      console.error('Error saving inbound email:', insertError);
      return NextResponse.json({ error: 'Failed to save email' }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Inbound Email Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
