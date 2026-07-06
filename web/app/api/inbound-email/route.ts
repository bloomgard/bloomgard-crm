import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    // 1. Event Filtering
    if (payload.type !== 'email.received') {
      return NextResponse.json({ message: 'Ignoring event' }, { status: 200 });
    }

    // 2. Extract Routing ID
    const toAddress = payload.data?.to?.[0];
    if (!toAddress) {
      return NextResponse.json({ error: 'Missing to address' }, { status: 400 });
    }
    const routingId = toAddress.split('@')[0];

    // 3. Tenant Lookup
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id')
      .eq('inbound_routing_id', routingId)
      .single();

    if (tenantError || !tenant) {
      console.error(`Tenant not found for routing ID: ${routingId}`, tenantError);
      return NextResponse.json({ error: 'Tenant not found' }, { status: 400 });
    }

    // 4. Fetch Full Email Body
    const emailId = payload.data?.email_id;
    if (!emailId) {
      return NextResponse.json({ error: 'Missing email_id in payload' }, { status: 400 });
    }

    let bodyText = '';
    let bodyHtml = '';

    const { data: fullEmail, error: fetchError } = await resend.emails.get(emailId);
    
    if (fetchError || !fullEmail) {
      console.warn(`Could not fetch full email body for ${emailId}. Continuing without body.`, fetchError);
      // Fallback: we won't have the body, but we still want to save the email metadata!
    } else {
      bodyText = fullEmail.text || '';
      bodyHtml = fullEmail.html || '';
    }

    // 5. Database Insertion
    const { error: insertError } = await supabase
      .from('inbound_emails')
      .insert({
        tenant_id: tenant.id,
        sender_email: payload.data.from,
        subject: payload.data.subject,
        body_text: bodyText,
        body_html: bodyHtml,
        message_id: payload.data.message_id || ''
      });

    if (insertError) {
      console.error('Error inserting inbound email:', insertError);
      return NextResponse.json({ error: 'Database insertion failed' }, { status: 500 });
    }

    // Return 200 on total success
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
