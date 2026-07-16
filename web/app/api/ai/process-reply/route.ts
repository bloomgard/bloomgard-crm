import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
const resend = new Resend(process.env.RESEND_API_KEY);

const AI_API_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = 'openai/gpt-4o-mini';

// Set a max duration if on Vercel Pro, otherwise ignored
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { tenantId, quoteId, clientEmail, clientMessage, parsedTenantId } = await request.json();

    if (!tenantId || !quoteId || !clientEmail || !clientMessage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
    if (!tenant || !tenant.ai_enabled || !AI_API_KEY) {
      return NextResponse.json({ message: 'AI disabled or missing API key' }, { status: 200 });
    }

    const { data: quote } = await supabase
      .from('quotations')
      .select('*, quotation_items (*)')
      .eq('id', quoteId)
      .single();

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

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

    const itemsSummary = quote.quotation_items?.map((i: any) => `${i.quantity}x ${i.item_name}`).join(', ') || '';
    const quoteContext = `Quote Number: ${quote.qn_number}\nItems Quoted: ${itemsSummary}\nStatus: ${quote.status}`;
    
    let conversationHistory = "";
    const pastConvos = quote.custom_metadata?.agent_conversations || [];
    if (pastConvos.length > 0) {
      conversationHistory = "\nPAST CONVERSATION HISTORY:\n" + pastConvos.map((msg: any) => `${msg.role.toUpperCase()}: ${msg.content}`).join('\n\n');
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
        subject: `Re: Following up on Quote ${quote.qn_number}`,
        text: agentReply
      });

      // Fallback for unverified domains
      if (sendError) {
         const { error: fallbackError } = await resend.emails.send({
           from: `Bloomgard AI <onboarding@resend.dev>`,
           to: clientEmail,
           subject: `Re: Following up on Quote ${quote.qn_number}`,
           text: agentReply
         });
         if (fallbackError) {
             return NextResponse.json({ error: fallbackError.message }, { status: 400 });
         }
      }

      // Log the AI response to agent_conversations and status_logs
      let customMetadata = quote.custom_metadata || {};
      let conversations = customMetadata.agent_conversations || [];
      // Note: the client message is already logged synchronously by the webhook.
      // We only log the agent's reply here.
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
          comments: `AI Agent processed customer reply and generated an automatic response.` 
      }]);
      
      return NextResponse.json({ success: true, message: 'AI reply generated and sent' }, { status: 200 });
    } else {
      return NextResponse.json({ error: 'Failed to generate AI response' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Async AI Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
