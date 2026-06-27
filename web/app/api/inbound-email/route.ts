import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key'; 
const supabase = createClient(supabaseUrl, supabaseKey);

const AI_API_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = 'openai/gpt-3.5-turbo'; 

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { quoteId, tenantId, clientMessage, agentEmail } = body;

    if (!quoteId || !tenantId || !clientMessage) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Fetch Quote & Tenant Schema
    const { data: quote, error: quoteError } = await supabase
      .from('quotations')
      .select(`*, clients (*), quotation_items (*)`)
      .eq('id', quoteId)
      .eq('tenant_id', tenantId)
      .single();

    if (quoteError || !quote) {
      throw new Error(`Failed to fetch quote context: ${quoteError?.message || 'Not found'}`);
    }

    const clientName = quote.clients?.company_name || quote.custom_metadata?.client_name || 'Client';
    const clientEmail = quote.clients?.email_id || quote.custom_metadata?.email_id;

    if (!clientEmail) {
        throw new Error('No email address found for this client.');
    }

    // 2. Append Client Message to Conversation Log
    let customMetadata = quote.custom_metadata || {};
    let conversations = customMetadata.agent_conversations || [];
    
    // Check if this is the first interaction, if so, we might want to log the initial outreach
    if (conversations.length === 0) {
       conversations.push({ role: 'agent', content: 'Initial Follow-up Email Sent', timestamp: new Date().toISOString() });
    }
    
    // Add new client message
    conversations.push({ role: 'client', content: clientMessage, timestamp: new Date().toISOString() });

    // 3. Formulate AI Prompt based on Persona
    const { data: schema } = await supabase
      .from('tenant_schemas')
      .select('schema_config')
      .eq('tenant_id', tenantId)
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

    const itemsSummary = quote.quotation_items?.map((item: any) => `${item.quantity}x ${item.item_name}`).join(', ') || 'the requested items';

    const systemPrompt = `You are an automated sales assistant named Bloomgard AI, working on behalf of ${agentEmail || 'the sales team'}. 
    You are in an ongoing email conversation with a client regarding a quote.
    
    Personality & Style:
    - Tone: ${tone}
    - English Level: ${englishLevel}
    - Desperation Level: ${desperation}
    
    CONTEXT:
    Client Name: ${clientName}
    Quote Number: ${quote.qn_number}
    Items Quoted: ${itemsSummary}
    
    CONVERSATION HISTORY:
    ${conversations.map((c: any) => `${c.role.toUpperCase()}: ${c.content}`).join('\n')}
    
    RULES:
    - Write a polite, professional, and concise reply to the client's latest message.
    - Refine the text according to the Personality & Style settings.
    - Keep it under 2 paragraphs.
    - Answer any questions they asked based on the context. If you don't know the answer, politely say you will check with the team.
    - Output ONLY the email body. Do not include subject lines or conversational filler like "Here is the email:".`;

    // 4. Generate AI Agent Reply
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://bloomgard.vercel.app", 
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "system", content: systemPrompt }]
      })
    });

    if (!aiResponse.ok) throw new Error('AI Reply Generation failed');
    const aiData = await aiResponse.json();
    const agentReply = aiData.choices[0].message.content.trim();

    // 5. Send Email via Nodemailer
    const transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      auth: { user: 'resend', pass: process.env.RESEND_API_KEY || '' }
    });

    const mailOptions = {
      from: `Bloomgard Quotes <onboarding@resend.dev>`, 
      to: clientEmail,
      subject: `Re: Following up on Quote ${quote.qn_number}`,
      text: agentReply
    };

    await transporter.sendMail(mailOptions);
    
    // 6. Append Agent Reply to Conversation Log
    conversations.push({ role: 'agent', content: agentReply, timestamp: new Date().toISOString() });

    // 7. Generate Summary of the entire thread
    const summaryPrompt = `Summarize the following sales conversation between an AI Agent and a Client in 1-2 short sentences. Include the conclusion or next steps.
    
    CONVERSATION:
    ${conversations.map((c: any) => `${c.role.toUpperCase()}: ${c.content}`).join('\n')}
    
    SUMMARY:`;

    const summaryResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${AI_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://bloomgard.vercel.app", 
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "system", content: summaryPrompt }]
      })
    });

    let agentSummary = customMetadata.agent_summary || "Conversation ongoing.";
    if (summaryResponse.ok) {
        const sumData = await summaryResponse.json();
        agentSummary = sumData.choices[0].message.content.trim();
    }

    // 8. Update Database
    customMetadata.agent_conversations = conversations;
    customMetadata.agent_summary = agentSummary;

    const now = new Date().toISOString();
    await supabase.from('quotations').update({ 
        custom_metadata: customMetadata, 
        last_contact_date: now 
    }).eq('id', quoteId);
    
    await supabase.from('status_logs').insert([{ 
        quotation_id: quoteId, 
        old_status: quote.status, 
        new_status: quote.status, 
        comments: `Client replied. AI Agent generated auto-reply and updated summary.` 
    }]);

    return NextResponse.json({ success: true, message: 'Reply sent and logged successfully', summary: agentSummary });

  } catch (error: any) {
    console.error('Inbound Email Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
