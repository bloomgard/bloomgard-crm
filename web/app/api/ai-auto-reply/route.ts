import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/postal';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const AI_API_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = 'openai/gpt-4o-mini';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { threadId, tenantId } = await request.json();

    if (!threadId || !tenantId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // 1. Fetch Tenant Settings
    const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
    if (!tenant || !tenant.ai_enabled || !AI_API_KEY) {
      return NextResponse.json({ message: 'AI disabled or missing API key' }, { status: 200 });
    }

    // 2. Fetch Conversation History
    const { data: emails } = await supabase
      .from('inbound_emails')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (!emails || emails.length === 0) {
      return NextResponse.json({ error: 'No emails found in thread' }, { status: 404 });
    }

    // The most recent inbound email to reply to
    const lastEmail = emails[emails.length - 1];
    
    // We don't want to reply to ourselves
    if (lastEmail.sender_email === tenant.custom_email_sender || lastEmail.sender_email.includes('@inbound.bloomgard.co')) {
       return NextResponse.json({ message: 'Last email was from agent. Skipping auto-reply.' }, { status: 200 });
    }

    // 3. Fetch AI Settings
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

    // 4. Build Conversation History for Prompt
    let conversationHistory = "CONVERSATION HISTORY:\n\n";
    emails.forEach((email: any) => {
       const role = (email.sender_email === tenant.custom_email_sender) ? 'AGENT' : 'CLIENT';
       conversationHistory += `[${role} - ${email.created_at}]\n${email.body_text || email.body_html}\n\n`;
    });

    const systemPrompt = `You are an automated sales assistant named Bloomgard AI, working on behalf of ${tenant.company_name}. 
You are currently managing an email thread on Auto-Pilot.

Personality & Style:
- Tone: ${tone}
- English Level: ${englishLevel}
- Desperation Level: ${desperation}

${conversationHistory}

RULES:
- Based on the entire conversation history above, write a polite, professional, and helpful reply to the most recent CLIENT message.
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
          { role: "system", content: systemPrompt }
        ]
      })
    });

    if (!aiResponse.ok) {
      throw new Error('Failed to generate AI response');
    }

    const aiData = await aiResponse.json();
    const agentReply = aiData.choices[0].message.content.trim();

    // 5. Send the Auto-Reply Email
    const fromEmail = tenant.custom_email_sender || 'support@bloomgard.co';
    const fromName = tenant.company_name || 'Bloomgard';
    
    let headers: any = undefined;
    if (lastEmail.message_id) {
      headers = [
        { name: 'In-Reply-To', value: lastEmail.message_id },
        { name: 'References', value: lastEmail.message_id }
      ];
    }
    
    const replySubject = lastEmail.subject.startsWith('Re:') ? lastEmail.subject : `Re: ${lastEmail.subject}`;

    const sentData = await sendEmail({
      from: `${fromName} <${fromEmail}>`,
      to: lastEmail.sender_email, // Send back to the client
      replyTo: tenant.inbound_routing_id ? `${tenant.inbound_routing_id}@inbound.bloomgard.co` : undefined,
      subject: replySubject,
      text: agentReply,
      headers
    });

    // 6. Insert AI Reply into inbound_emails for UI threading
    const newMsgId = (sentData && sentData.id) ? `<${sentData.id}@resend.dev>` : `<auto-${Date.now()}@bloomgard.co>`;
    
    await supabase.from('inbound_emails').insert({
      tenant_id: tenant.id,
      sender_email: fromEmail,
      subject: replySubject,
      body_text: agentReply,
      body_html: agentReply.replace(/\n/g, '<br/>'),
      message_id: newMsgId,
      thread_id: threadId
    });

    return NextResponse.json({ success: true, message: 'Auto-pilot reply sent.' }, { status: 200 });
  } catch (error: any) {
    console.error('Auto-Pilot Engine Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
