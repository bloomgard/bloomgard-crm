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
    const { tenantId } = body;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: 'Missing tenantId' }, { status: 400 });
    }

    // 1. Fetch Custom Agents from schema
    const { data: schema, error: schemaErr } = await supabase
      .from('tenant_schemas')
      .select('schema_config')
      .eq('tenant_id', tenantId)
      .single();

    if (schemaErr || !schema) throw new Error("Could not load schema.");
    
    const agentConfig = schema.schema_config.find((s: any) => s.is_agent_config);
    const customAgents = agentConfig ? agentConfig.agents : [];

    const aiSettingsConfig = schema.schema_config.find((s: any) => s.is_ai_settings);
    const tone = aiSettingsConfig?.tone || 'Professional';
    const englishLevel = aiSettingsConfig?.englishLevel || 'Native';
    const desperation = aiSettingsConfig?.desperation || 'Low';

    if (!customAgents || customAgents.length === 0) {
       return NextResponse.json({ success: true, message: 'No autonomous agents configured in this workspace.' });
    }

    // 2. Fetch all quotes needing follow-up (Inquiry status, not dispatched)
    const { data: quotes, error: quotesErr } = await supabase
      .from('quotations')
      .select(`*, clients (*), quotation_items (*)`)
      .eq('tenant_id', tenantId)
      .is('follow_up_status', null);

    if (quotesErr || !quotes) throw new Error("Could not load quotes.");

    // 3. Filter quotes that have an assigned custom agent
    let tasks: any[] = [];
    quotes.forEach((q: any) => {
      let meta = q.custom_metadata;
      if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch(e) { meta = {}; } }
      if (meta && meta.agent_id) {
         const assignedAgent = customAgents.find((a: any) => a.id === meta.agent_id);
         if (assignedAgent) {
             // Respect manual control (auto_send)
             if (assignedAgent.auto_send === false) return;
             
             // Respect frequency
             const freq = assignedAgent.frequency || 'Immediate';
             let isDue = true;
             if (freq !== 'Immediate') {
                 const targetDate = new Date(q.created_at);
                 if (freq === 'Daily') targetDate.setDate(targetDate.getDate() + 1);
                 if (freq === '3 Days') targetDate.setDate(targetDate.getDate() + 3);
                 if (freq === 'Weekly') targetDate.setDate(targetDate.getDate() + 7);
                 if (new Date() < targetDate) isDue = false;
             }
             
             if (isDue) {
                 tasks.push({ quote: q, agent: assignedAgent });
             }
         }
      }
    });

    if (tasks.length === 0) {
      return NextResponse.json({ success: true, message: 'No pending actions required. All assigned quotes have already been followed up on.' });
    }

    // 4. Group by Agent Email & Rank by Importance
    // We want agents with higher importance (10) to process first to not overwhelm the client
    tasks.sort((a, b) => (b.agent.importance || 5) - (a.agent.importance || 5));
    
    let processedCount = 0;

    // 5. Execute scheduled follow-ups
    const transporter = nodemailer.createTransport({
      host: 'smtp.resend.com',
      port: 465,
      auth: { user: 'resend', pass: process.env.RESEND_API_KEY || '' }
    });

    for (const task of tasks) {
      const { quote, agent } = task;

      const clientName = quote.clients?.company_name || quote.custom_metadata?.client_name || 'Client';
      const clientEmail = quote.clients?.email_id || quote.custom_metadata?.email_id;
      
      if (!clientEmail) continue;

      const itemsSummary = quote.quotation_items?.map((item: any) => `${item.quantity}x ${item.item_name}`).join(', ') || 'the requested items';
      
      const mode = agent.mode || 'email';

      const promptContext = `
      Your Identity: 
      - Name: ${agent.name}
      - Email: ${agent.email}
      - Phone: ${agent.phone}
      
      Your Primary Task: ${agent.task}
      
      Personality & Style:
      - Tone: ${tone}
      - English Level: ${englishLevel}
      - Desperation Level: ${desperation}
      
      Core Instructions & Policy: 
      ${agent.instructions}
      
      CONTEXT:
      Client Name: ${clientName}
      Quote Number: ${quote.qn_number}
      Items Quoted: ${itemsSummary}
      `;

      try {
        if (mode === 'call') {
          const clientPhone = quote.clients?.phone_number || quote.custom_metadata?.phone_number;
          if (!clientPhone) {
            console.warn(`No phone number for quote ${quote.qn_number}, skipping voice call.`);
            continue;
          }

          const callTaskPrompt = `You are an automated voice agent acting on behalf of a company. 
          ${promptContext}
          RULES:
          - Speak naturally and professionally to the client on the phone.
          - Strictly follow your core instructions and tone.
          - Achieve the assigned task over this phone call.`;

          const blandApiKey = process.env.BLAND_API_KEY;
          if (!blandApiKey) throw new Error("BLAND_API_KEY is not set in environment variables.");

          const callRes = await fetch('https://api.bland.ai/v1/calls', {
            method: 'POST',
            headers: {
              'authorization': blandApiKey,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              phone_number: clientPhone,
              task: callTaskPrompt,
              reduce_latency: true,
              voice_id: 0
            })
          });

          if (!callRes.ok) {
            const errData = await callRes.text();
            throw new Error(`Bland AI Error: ${errData}`);
          }

          await supabase.from('quotations').update({ follow_up_status: 'Voice Call Dispatched', last_contact_date: new Date().toISOString() }).eq('id', quote.id);
          await supabase.from('status_logs').insert([{ quotation_id: quote.id, old_status: quote.status, new_status: quote.status, comments: `Autonomous Agent [${agent.name}] dispatched VOICE CALL based on Importance Level ${agent.importance}.` }]);
          
          processedCount++;

        } else {
          // Email Mode
          const systemPrompt = `You are an automated agent acting on behalf of a company.
          ${promptContext}
          RULES:
          - Write a highly personalized, professional email to the client to achieve your Task.
          - Follow the core instructions and tone strictly.
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

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            const emailBody = aiData.choices[0].message.content.trim();

            const mailOptions = {
              from: `${agent.name} <onboarding@resend.dev>`, 
              to: clientEmail,
              subject: `Regarding Quote ${quote.qn_number}`,
              text: emailBody
            };

            await transporter.sendMail(mailOptions);
            
            await supabase.from('quotations').update({ follow_up_status: 'Email Dispatched', last_contact_date: new Date().toISOString() }).eq('id', quote.id);
            await supabase.from('status_logs').insert([{ quotation_id: quote.id, old_status: quote.status, new_status: quote.status, comments: `Autonomous Agent [${agent.name}] dispatched EMAIL based on Importance Level ${agent.importance}.` }]);
            
            processedCount++;
          }
        }
      } catch (err: any) {
        console.error(`Error processing task for quote ${quote.qn_number}:`, err);
      }
    }

    return NextResponse.json({ success: true, message: `Coordinator successfully executed ${processedCount} agent tasks.` });

  } catch (error: any) {
    console.error('Coordinator Trigger Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
