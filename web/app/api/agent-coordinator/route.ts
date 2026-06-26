import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; 
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

    if (!customAgents || customAgents.length === 0) {
       return NextResponse.json({ success: true, message: 'No autonomous agents configured.' });
    }

    // 2. Fetch all quotes needing follow-up (Inquiry status, not dispatched)
    const { data: quotes, error: quotesErr } = await supabase
      .from('quotations')
      .select(`*, clients (*), quotation_items (*)`)
      .eq('tenant_id', tenantId)
      .eq('status', 'Inquiry')
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
             tasks.push({ quote: q, agent: assignedAgent });
         }
      }
    });

    if (tasks.length === 0) {
      return NextResponse.json({ success: true, message: 'No quotes assigned to autonomous agents require action.' });
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
      
      const systemPrompt = `You are an automated agent acting on behalf of a company.
      Your Identity: 
      - Name: ${agent.name}
      - Email: ${agent.email}
      - Phone: ${agent.phone}
      
      Your Primary Task: ${agent.task}
      
      Core Instructions & Policy: 
      ${agent.instructions}
      
      CONTEXT:
      Client Name: ${clientName}
      Quote Number: ${quote.qn_number}
      Items Quoted: ${itemsSummary}
      
      RULES:
      - Write a highly personalized, professional email to the client to achieve your Task.
      - Follow the core instructions and tone strictly.
      - Output ONLY the email body. Do not include subject lines or conversational filler.`;

      try {
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
          
          await supabase.from('quotations').update({ follow_up_status: 'Agent Dispatched', last_contact_date: new Date().toISOString() }).eq('id', quote.id);
          await supabase.from('status_logs').insert([{ quotation_id: quote.id, old_status: quote.status, new_status: quote.status, comments: `Autonomous Agent [${agent.name}] dispatched email based on Importance Level ${agent.importance}.` }]);
          
          processedCount++;
        }
      } catch (err) {
        console.error(`Error processing task for quote ${quote.qn_number}:`, err);
      }
    }

    return NextResponse.json({ success: true, message: `Coordinator successfully executed ${processedCount} agent tasks.` });

  } catch (error: any) {
    console.error('Coordinator Trigger Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
