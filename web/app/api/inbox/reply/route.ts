import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  try {
    const { tenantId, emailId, to, subject, htmlBody, parsedTenantId } = await request.json();

    if (!tenantId || !to || !subject || !htmlBody) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    let headers = undefined;
    if (emailId) {
      const { data: originalEmail } = await supabase.from('inbound_emails').select('message_id').eq('id', emailId).single();
      if (originalEmail?.message_id) {
        headers = [
          { name: 'In-Reply-To', value: originalEmail.message_id },
          { name: 'References', value: originalEmail.message_id }
        ];
      }
    }

    const { getDynamicSender, sendEmail } = require('@/lib/postal');
    const fromEmail = tenant.custom_email_sender || 'support@bloomgard.co';
    const fromName = tenant.company_name || 'Bloomgard';
    
    // Uses the centralized postal module so it inherits the fallback testing logic
    await sendEmail({
      from: `${fromName} <${fromEmail}>`,
      to,
      replyTo: tenant.inbound_routing_id ? `${tenant.inbound_routing_id}@inbound.bloomgard.co` : undefined,
      subject,
      html: htmlBody,
      headers
    });

    // Attempt to log it if it belongs to a known quote (by searching subject for QN)
    const qnMatch = subject.match(/QN-\d{4}-\d{3}(?:-Rev-\d+)?/);
    if (qnMatch) {
       const { data: quote } = await supabase.from('quotations').select('*').eq('tenant_id', tenantId).eq('qn_number', qnMatch[0]).single();
       if (quote) {
          let customMetadata = quote.custom_metadata || {};
          let conversations = customMetadata.agent_conversations || [];
          conversations.push({ role: 'agent', content: htmlBody.replace(/<[^>]+>/g, ''), timestamp: new Date().toISOString() });
          customMetadata.agent_conversations = conversations;

          await supabase.from('quotations').update({ 
              custom_metadata: customMetadata, 
              last_contact_date: new Date().toISOString() 
          }).eq('id', quote.id);
       }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Inbox Reply Route Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
