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
    let { quoteId, tenantId, clientMessage, agentEmail } = body;

    // --- POSTAL & RESEND INBOUND WEBHOOK PARSING ---
    const isPostalWebhook = !!body.rcpt_to && !!body.mail_from;
    const isResendWebhook = !isPostalWebhook && (body.type === 'email.received' || (body.subject && (body.text || body.html)));
    
    let senderEmail = 'unknown@example.com';
    let parsedSubject = '';
    
    if (isPostalWebhook || isResendWebhook) {
      const emailData = isResendWebhook ? (body.type === 'email.received' ? body.data : body) : body;
      parsedSubject = emailData.subject || '';
      
      if (isPostalWebhook) {
        agentEmail = emailData.rcpt_to || 'agent@bloomgard.com';
        senderEmail = emailData.mail_from || 'unknown@example.com';
        clientMessage = emailData.plain_body || emailData.html_body || 'No message body.';
      } else {
        agentEmail = Array.isArray(emailData.to) ? emailData.to[0] : (emailData.to || 'agent@bloomgard.com');
        senderEmail = emailData.from || 'unknown@example.com';
        clientMessage = emailData.text || emailData.html || 'No message body.';
      }

      // 🔍 Log the webhook payload to Supabase
      try {
        await supabase.from('webhook_logs').insert([{
          source: isPostalWebhook ? 'postal' : 'resend',
          payload: body,
          parsed_sender: senderEmail,
          parsed_receiver: agentEmail,
          parsed_subject: parsedSubject
        }]);
      } catch (logErr) {
        console.error("Failed to log webhook:", logErr);
      }
      
      const match = parsedSubject.match(/(QN-\d+)/i);
      if (match) {
        // --- EXISTING QUOTE LOGIC ---
        const qnNumber = match[1].toUpperCase();
        const { data: foundQuote, error: lookupError } = await supabase
          .from('quotations').select('id, tenant_id').eq('qn_number', qnNumber).single();
          
        if (lookupError || !foundQuote) return NextResponse.json({ success: false, error: `Quote not found: ${qnNumber}` }, { status: 404 });
        quoteId = foundQuote.id;
        tenantId = foundQuote.tenant_id;
      } else {
        // --- COLD LEAD LOGIC (NO QN NUMBER) ---
        const { data: tenantFound, error: tErr } = await supabase
          .from('tenants').select('id').eq('custom_email_sender', agentEmail).maybeSingle();
        
        // If not found by exact email (e.g. testing), try finding any tenant to prevent crash during demo
        const finalTenantId = tenantFound ? tenantFound.id : (await supabase.from('tenants').select('id').limit(1).single()).data?.id;
        if (!finalTenantId) return NextResponse.json({ success: false, error: 'No tenant found for routing' }, { status: 404 });

        let clientId = null;
        const { data: clientFound } = await supabase.from('clients').select('id').eq('tenant_id', finalTenantId).eq('email_id', senderEmail).maybeSingle();
        if (clientFound) clientId = clientFound.id;
        else {
           const { data: newClient } = await supabase.from('clients').insert([{
              tenant_id: finalTenantId, company_name: senderEmail.split('@')[0], email_id: senderEmail
           }]).select('id').single();
           clientId = newClient?.id;
        }

        const parsePrompt = `You are a sales AI. Read the following cold email and extract the items the customer wants to buy. Output ONLY a JSON array of objects with keys: item_name (string), quantity (number), unit_price (number - estimate if not provided, else 0). Email: ${clientMessage}`;
        let aiParsedItems = [];
        try {
           const aiRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST", headers: { "Authorization": `Bearer ${AI_API_KEY}`, "Content-Type": "application/json" },
              body: JSON.stringify({ model: AI_MODEL, messages: [{ role: "system", content: parsePrompt }] })
           });
           const aiData = await aiRes.json();
           const content = aiData?.choices?.[0]?.message?.content;
           const jsonStr = content ? (content.match(/\[[\s\S]*\]/)?.[0] || '[]') : '[]';
           aiParsedItems = JSON.parse(jsonStr);
        } catch (e) {
           console.error("AI Parse Error:", e);
        }

        const newQn = 'LD-' + Math.floor(1000 + Math.random() * 9000);
        await supabase.from('quotations').insert([{
           tenant_id: finalTenantId, client_id: clientId, qn_number: newQn, status: 'Lead',
           custom_metadata: { lead_email_body: clientMessage, lead_email_subject: parsedSubject, ai_parsed_items: aiParsedItems, agent_email: agentEmail }
        }]);

        return NextResponse.json({ success: true, message: 'Processed as Cold Lead' });
      }
    }

    if (!quoteId || !tenantId || !clientMessage) {
      return NextResponse.json({ success: false, error: 'Missing required fields or invalid webhook payload' }, { status: 400 });
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
    const isPostal = process.env.EMAIL_PROVIDER === 'postal';
    const transporter = nodemailer.createTransport({
      host: isPostal ? process.env.POSTAL_SMTP_HOST : 'smtp.resend.com',
      port: isPostal ? parseInt(process.env.POSTAL_SMTP_PORT || '2525') : 465,
      auth: { 
        user: isPostal ? process.env.POSTAL_SMTP_USER || '' : 'resend', 
        pass: isPostal ? process.env.POSTAL_SMTP_PASS || '' : process.env.RESEND_API_KEY || '' 
      }
    });

    const outboundSenderEmail = agentEmail || 'ai@bloomgard.co';
    const senderName = quote.clients?.company_name ? `${quote.clients.company_name} AI` : 'Bloomgard AI';

    const mailOptions = {
      from: `${senderName} <${outboundSenderEmail}>`, 
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
