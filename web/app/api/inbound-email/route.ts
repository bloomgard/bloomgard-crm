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
      console.error(`Tenant not found for routing ID: ${routingId}`, tenantError);
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

    // --- AI AUTOMATION FEATURE (FULLY AUTONOMOUS AUTOREPLY) ---
    if (tenant.ai_enabled && AI_API_KEY) {
      // Find the most recent quote for this client to get context
      const { data: quote } = await supabase
        .from('quotations')
        .select('*, quotation_items (*)')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
        
      // Fetch AI Settings from schema
      const { data: schema } = await supabase
        .from('tenant_schemas')
        .select('schema_config')
        .eq('tenant_id', tenant.id)
        .single();
        
      let tone = 'Professional', englishLevel = 'Native', desperation = 'Low';
      if (schema?.schema_config) {
        const aiSettingsConfig = schema.schema_config.find((s: any) => s.is_ai_settings);
        if (aiSettingsConfig) {
          tone = aiSettingsConfig.tone || tone;
          englishLevel = aiSettingsConfig.englishLevel || englishLevel;
          desperation = aiSettingsConfig.desperation || desperation;
        }
      }

      let quoteContext = "No specific quote found.";
      let conversationHistory = "";
      if (quote) {
        const itemsSummary = quote.quotation_items?.map((i: any) => `${i.quantity}x ${i.item_name}`).join(', ') || '';
        quoteContext = `Quote Number: ${quote.qn_number}\nItems Quoted: ${itemsSummary}\nStatus: ${quote.status}`;
        
        const pastConvos = quote.custom_metadata?.agent_conversations || [];
        if (pastConvos.length > 0) {
          conversationHistory = "\nPAST CONVERSATION HISTORY:\n" + pastConvos.map((msg: any) => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n');
        }
      }

      const systemPrompt = `You are an automated sales assistant named Bloomgard AI, working on behalf of ${tenant.company_name}. 
You are responding to an inbound email from a client.

Personality & Style:
- Tone: ${tone}
- English Level: ${englishLevel}
- Desperation Level: ${desperation}

CONTEXT:
Client Email: ${clientEmail}
${quoteContext}
${conversationHistory}

RULES:
- Write a polite, professional, and concise reply to the client's message.
- Refine the text according to the Personality & Style settings.
- Keep it under 2 paragraphs.
- Output ONLY the email body. Do not include subject lines or conversational filler like "Here is the email:".`;

      const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${AI_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://bloomgard.vercel.app", 
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Client's Email Message:\n\n${clientMessage}` }
          ]
        })
      });

      if (aiResponse.ok) {
        const aiData = await aiResponse.json();
        const agentReply = aiData.choices[0].message.content.trim();

        // Send Email via Resend
        const { error: sendError } = await resend.emails.send({
          from: `${tenant.company_name} <${parsedTenantId}@inbound.bloomgard.co>`,
          to: clientEmail,
          subject: `Re: ${payload.data.subject || 'Your Inquiry'}`,
          text: agentReply
        });

        // Fallback for unverified domains
        if (sendError) {
           await resend.emails.send({
             from: `Bloomgard AI <onboarding@resend.dev>`,
             to: clientEmail,
             subject: `Re: ${payload.data.subject || 'Your Inquiry'}`,
             text: agentReply
           });
        }

        // Log the AI response to agent_conversations and status_logs
        if (quote) {
           let customMetadata = quote.custom_metadata || {};
           let conversations = customMetadata.agent_conversations || [];
           conversations.push({ role: 'client', content: clientMessage, timestamp: new Date().toISOString() });
           conversations.push({ role: 'agent', content: agentReply, timestamp: new Date().toISOString() });
           customMetadata.agent_conversations = conversations;

           await supabase.from('quotations').update({ 
              custom_metadata: customMetadata, 
              last_contact_date: new Date().toISOString() 
           }).eq('id', quote.id);
           
           await supabase.from('status_logs').insert([{ 
              quotation_id: quote.id, 
              old_status: quote.status, 
              new_status: quote.status, 
              comments: `Client replied. AI Agent generated auto-reply.` 
           }]);
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Webhook Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
