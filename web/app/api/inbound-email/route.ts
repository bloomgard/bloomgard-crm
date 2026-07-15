import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(process.env.RESEND_API_KEY);

const AI_API_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = 'openai/gpt-4o-mini';

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
    
    let exactEmail = toAddress;
    const emailMatch = toAddress.match(/<([^>]+)>/);
    if (emailMatch) {
      exactEmail = emailMatch[1];
    }
    
    exactEmail = exactEmail.toLowerCase().trim();
    const parsedTenantId = exactEmail.split('@')[0];
    
    console.log("PARSED TENANT ID:", parsedTenantId);

    // 3. Tenant Lookup
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('id, company_name, ai_enabled')
      .ilike('inbound_routing_id', parsedTenantId)
      .single();

    if (tenantError || !tenant) {
      console.error(`Tenant not found for routing ID: ${parsedTenantId}`, tenantError);
      return NextResponse.json({ error: 'Tenant not found' }, { status: 400 });
    }

    // 4. Fetch Full Email Body
    const emailId = payload.data?.email_id;
    let bodyText = payload.data?.text || '';
    let bodyHtml = payload.data?.html || '';

    if (emailId) {
      const { data: fullEmail, error: fetchError } = await resend.emails.receiving.get(emailId);
      if (!fetchError && fullEmail) {
        bodyText = fullEmail.text || bodyText;
        bodyHtml = fullEmail.html || bodyHtml;
      }
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
        message_id: payload.data.message_id || ''
      });

    if (insertError) {
      console.error('Error inserting inbound email:', insertError);
    }

    // --- SYNCHRONOUS LOGGING TO QUOTE ---
    // Find the most recent quote to attach this email to its conversation log
    const { data: quote } = await supabase
      .from('quotations')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

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
    }

    // Return 200 on total success, ensuring Resend doesn't retry
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
