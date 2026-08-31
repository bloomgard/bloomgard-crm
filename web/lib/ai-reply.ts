import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const AI_API_KEY = process.env.OPENROUTER_API_KEY || '';
const AI_MODEL = 'openai/gpt-4o-mini';

/**
 * Build a human-readable digest of the tenant's manual Master Data so the AI can
 * answer product / pricing / terms questions with authoritative company facts.
 * Includes keys whether or not they have an AI description.
 */
async function buildMasterDataContext(tenantId: string): Promise<string> {
  const { data: entries } = await supabase
    .from('master_data_entries')
    .select('id, key_name, parent_id, ai_description')
    .eq('tenant_id', tenantId)
    .eq('tab_type', 'manual');
  if (!entries || entries.length === 0) return '';

  const { data: values } = await supabase
    .from('master_data_values')
    .select('entry_id, value_text')
    .in('entry_id', entries.map((e) => e.id));

  const CAP = 25;
  const total = new Map<string, number>();
  const byEntry = new Map<string, string[]>();
  (values || []).forEach((v) => {
    total.set(v.entry_id, (total.get(v.entry_id) || 0) + 1);
    if (!byEntry.has(v.entry_id)) byEntry.set(v.entry_id, []);
    const list = byEntry.get(v.entry_id)!;
    if (list.length < CAP && !list.includes(v.value_text)) list.push(v.value_text);
  });

  const byId = new Map(entries.map((e) => [e.id, e]));
  const lines = entries.map((e) => {
    const vals = byEntry.get(e.id) || [];
    const parent = e.parent_id ? byId.get(e.parent_id) : null;
    const rel = parent ? ` (choice depends on ${parent.key_name})` : '';
    const desc = e.ai_description ? ` — ${e.ai_description}` : '';
    const more = (total.get(e.id) || 0) > vals.length ? `, … (${total.get(e.id)} total)` : '';
    const sample = vals.length ? `: ${vals.join(', ')}${more}` : '';
    return `- ${e.key_name}${rel}${desc}${sample}`;
  });

  return `MASTER DATA (authoritative company facts — use these for any product, code, pricing, UOM or terms specifics; do not invent values):\n${lines.join('\n')}`;
}

/** Recent agent-authored replies across this tenant, used to mirror the team's habitual tone. */
async function buildToneExamples(tenantId: string, excludeQuoteId?: string): Promise<string> {
  const { data: quotes } = await supabase
    .from('quotations')
    .select('id, custom_metadata')
    .eq('tenant_id', tenantId)
    .order('last_contact_date', { ascending: false })
    .limit(15);

  const samples: string[] = [];
  for (const q of quotes || []) {
    if (excludeQuoteId && q.id === excludeQuoteId) continue;
    let meta: any = q.custom_metadata;
    if (typeof meta === 'string') { try { meta = JSON.parse(meta); } catch { meta = {}; } }
    const convos = meta?.agent_conversations || [];
    for (let i = convos.length - 1; i >= 0 && samples.length < 4; i--) {
      if (convos[i].role === 'agent' && convos[i].content?.length > 40) {
        samples.push(convos[i].content.trim().slice(0, 600));
      }
    }
    if (samples.length >= 4) break;
  }
  if (samples.length === 0) return '';
  return `HOW THIS TEAM ACTUALLY WRITES (mirror this voice, greeting style, sign-off and level of formality):\n${samples.map((s, i) => `Example ${i + 1}:\n"""${s}"""`).join('\n\n')}`;
}

export async function processAiAutoReply(
  threadId: string,
  tenantId: string,
  agentId: string | null = null,
  quoteId: string | null = null,
  threadRowId: string | null = null
) {
  try {
    if (!threadId || !tenantId) {
      return { success: false, error: 'Missing required fields' };
    }

    const { data: tenant } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
    if (!tenant || !tenant.ai_enabled || !AI_API_KEY) {
      return { success: false, message: 'AI disabled or missing API key' };
    }

    // Conversation to reply to.
    const { data: targetEmails } = await supabase
      .from('inbound_emails')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (!targetEmails || targetEmails.length === 0) {
      return { success: false, error: 'No emails found in thread' };
    }
    const lastEmail = targetEmails[targetEmails.length - 1];

    // Widen to the whole quote conversation when we can match a QN.
    let emails = targetEmails;
    const qnMatch = (lastEmail.subject || '').match(/QN-\d{4}-\d{3}(?:-Rev-\d+)?/);
    if (qnMatch) {
      const { data: quoteEmails } = await supabase
        .from('inbound_emails')
        .select('*')
        .eq('tenant_id', tenant.id)
        .ilike('subject', `%${qnMatch[0]}%`)
        .order('created_at', { ascending: true });
      if (quoteEmails && quoteEmails.length > 0) emails = quoteEmails;
    }

    if (lastEmail.sender_email === tenant.custom_email_sender || lastEmail.sender_email.includes('@inbound.bloomgard.co')) {
      return { success: true, message: 'Last email was from agent. Skipping.' };
    }

    // AI settings (tone + instructions + routing rules).
    const { data: schema } = await supabase
      .from('tenant_schemas')
      .select('schema_config')
      .eq('tenant_id', tenant.id)
      .single();

    let tone = 'Professional', englishLevel = 'Native', desperation = 'Low', instructions = '';
    let emailRouting: any[] = [];
    const aiCfg = schema?.schema_config?.find((s: any) => s.is_ai_settings);
    if (aiCfg) {
      tone = aiCfg.tone || tone;
      englishLevel = aiCfg.englishLevel || englishLevel;
      desperation = aiCfg.desperation || desperation;
      instructions = aiCfg.instructions || '';
      emailRouting = aiCfg.emailRouting || [];
    }

    // Resolve the quote for context (explicit id wins).
    let quote: any = null;
    if (quoteId) {
      ({ data: quote } = await supabase.from('quotations').select('*, quotation_items(*)').eq('id', quoteId).single());
    } else if (qnMatch) {
      ({ data: quote } = await supabase.from('quotations').select('*, quotation_items(*)').eq('tenant_id', tenant.id).eq('qn_number', qnMatch[0]).single());
    }

    const [masterData, toneExamples] = await Promise.all([
      buildMasterDataContext(tenant.id),
      buildToneExamples(tenant.id, quote?.id),
    ]);

    let conversationHistory = 'CONVERSATION HISTORY:\n\n';
    emails.forEach((email: any) => {
      const role = email.sender_email === tenant.custom_email_sender ? 'AGENT' : 'CLIENT';
      conversationHistory += `[${role} - ${email.created_at}]\n${email.body_text || email.body_html}\n\n`;
    });

    let quoteContext = '';
    if (quote) {
      const items = (quote.quotation_items || []).map((i: any) => `${i.quantity}x ${i.item_name} (${i.item_code || 'n/a'}) @ ${i.item_rate ?? '?'}`).join('; ');
      quoteContext = `\nQUOTE CONTEXT:\nNumber: ${quote.qn_number}\nStatus: ${quote.status}\nItems: ${items || 'none recorded'}\n`;
    }

    const routingHint = emailRouting.length
      ? `\nROUTING RULES (if the client's message matches, mention that you are forwarding to the right person):\n${emailRouting.map((r: any) => `- If about "${r.lookFor}" -> route to ${r.routeTo}${r.sendRouteMessage && r.routeMessage ? ` (say: ${r.routeMessage})` : ''}`).join('\n')}`
      : '';

    const systemPrompt = `You are Bloomgard AI, replying to an inbound client email on behalf of ${tenant.company_name}.

Personality & Style:
- Tone: ${tone}
- English Level: ${englishLevel}
- Desperation Level: ${desperation}

${instructions ? `COMPANY INSTRUCTIONS FOR YOU (follow strictly):\n${instructions}\n` : ''}
${masterData ? masterData + '\n' : ''}
${toneExamples ? toneExamples + '\n' : ''}
${quoteContext}${routingHint}

${conversationHistory}

RULES:
- Reply to the most recent CLIENT message using the master data for any specifics.
- Match the team's habitual voice shown in the examples above.
- Keep it under 2 short paragraphs.
- Output ONLY the email body — no subject line, no "Here is the email:" preamble.`;

    if (process.env.DEBUG_AI_PROMPT) console.log('--- AI REPLY SYSTEM PROMPT ---\n' + systemPrompt + '\n--- END ---');

    const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://bloomgard.vercel.app',
      },
      body: JSON.stringify({ model: AI_MODEL, messages: [{ role: 'system', content: systemPrompt }] }),
    });
    if (!aiResponse.ok) throw new Error('Failed to generate AI response');

    const aiData = await aiResponse.json();
    if (aiData.usage) {
      const { logAiUsage } = await import('@/utils/usageLogger');
      await logAiUsage(tenant.id, agentId, 'ai-auto-reply', aiData.usage);
    }
    const agentReply = aiData.choices[0].message.content.trim();

    // Save the draft for human review — never auto-send.
    const draftPayload: any = { triage_status: 'incoming', ai_draft_text: agentReply, last_updated: new Date().toISOString() };
    if (agentId) draftPayload.agent_id = agentId;

    if (threadRowId) {
      await supabase.from('email_threads').update(draftPayload).eq('id', threadRowId);
    } else if (quote) {
      const { data: existing } = await supabase.from('email_threads').select('id').eq('quote_id', quote.id).maybeSingle();
      if (existing) {
        await supabase.from('email_threads').update(draftPayload).eq('id', existing.id);
      } else {
        await supabase.from('email_threads').insert({ tenant_id: tenant.id, quote_id: quote.id, ...draftPayload });
      }
    }

    return { success: true, message: 'Draft generated for review.', draft: agentReply };
  } catch (error: any) {
    console.error('processAiAutoReply error:', error);
    return { success: false, error: error.message || 'Internal Server Error' };
  }
}
