import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getMailTransporter } from '@/lib/postal';
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy_key'; 
const supabase = createClient(supabaseUrl, supabaseKey);

const AI_API_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = 'openai/gpt-3.5-turbo'; 

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { quoteId, tenantId, agentEmail, customMessage } = body;

    if (!quoteId || !tenantId) {
      return NextResponse.json({ success: false, error: 'Missing quoteId or tenantId' }, { status: 400 });
    }

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

    const itemsSummary = quote.quotation_items?.map((item: any) => `${item.quantity}x ${item.item_name}`).join(', ') || 'the requested items';
    
    const { data: schema } = await supabase
      .from('tenant_schemas')
      .select('schema_config')
      .eq('tenant_id', tenantId)
      .single();
      
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('company_name, custom_email_sender, email_provider')
      .eq('id', tenantId)
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

    const systemPrompt = `You are an automated sales assistant named Bloomgard AI, working on behalf of ${agentEmail}. 
    Your task is to write a follow-up email to a client who hasn't responded to a quote.
    
    Personality & Style:
    - Tone: ${tone}
    - English Level: ${englishLevel}
    - Desperation Level: ${desperation}
    
    CONTEXT:
    Client Name: ${clientName}
    Quote Number: ${quote.qn_number}
    Items Quoted: ${itemsSummary}
    
    ${customMessage ? `BASE MESSAGE (From User):
    "${customMessage}"` : ''}
    
    RULES:
    ${customMessage ? '- Use the BASE MESSAGE provided above as the exact core of your email.' : '- Write a polite, professional, and concise follow-up email.'}
    - Refine the text according to the Personality & Style settings.
    - Keep it under 3 paragraphs.
    - Output ONLY the email body. Do not include subject lines or conversational filler.`;

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

    if (!aiResponse.ok) throw new Error('AI Generation failed');
    const aiData = await aiResponse.json();
    const emailBody = aiData.choices[0].message.content.trim();

    const transporter = getMailTransporter(tenantData?.email_provider);

    const fallbackSender = 'info@bloomgard.co'; 
    const senderAddress = tenantData?.custom_email_sender || fallbackSender;
    const fromString = `${tenantData?.company_name || 'Bloomgard System'} <${senderAddress}>`;

    const mailOptions = {
      from: fromString, 
      to: clientEmail,
      subject: `Following up on Quote ${quote.qn_number}`,
      text: emailBody
    };

    await transporter.sendMail(mailOptions);
    const now = new Date().toISOString();
    
    let meta = quote.custom_metadata;
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e) { meta = {}; } }
    if (!meta) meta = {};
    if (!meta.agent_conversations) meta.agent_conversations = [];
    
    meta.agent_conversations.push({
      role: 'agent',
      content: emailBody,
      timestamp: now
    });
    
    if (!meta.agent_summary) {
      meta.agent_summary = "Initial Follow-up Email Sent.";
    }

    await supabase.from('quotations').update({ follow_up_status: 'Agent Dispatched', last_contact_date: now, custom_metadata: meta }).eq('id', quoteId);
    await supabase.from('status_logs').insert([{ quotation_id: quoteId, old_status: quote.status, new_status: quote.status, comments: `AI Agent dispatched automated follow-up email. Triggered by ${agentEmail}.` }]);

    return NextResponse.json({ success: true, message: 'Agent dispatched successfully' });

  } catch (error: any) {
    console.error('Agent Trigger Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}