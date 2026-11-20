import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/agent/core';
import { SMART_MODEL, parseModelJson } from '@/lib/ai/models';

// same-origin only: the dashboard calls this with the user's session
const corsHeaders: Record<string, string> = {};

export async function POST(req: Request) {
  try {
    // signed in, and only ever reading this user's own workspace catalogue
    const ctx = await authenticate(req);
    if (!ctx) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const body = await req.json();
    const { email: rawEmail, blueprint } = body;
    const email = rawEmail ? { ...rawEmail, tenant_id: ctx.tenantId } : rawEmail;
    const companyName = ctx.tenant?.company_name || body.companyName || '';
    const agent = { name: ctx.profile?.full_name || '', title: ctx.profile?.job_title || '', phone: ctx.profile?.phone || '' };

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "System offline. Please contact support." }, { status: 500, headers: corsHeaders });
    }

    if (!email) {
      return NextResponse.json({ error: "Missing email content" }, { status: 400, headers: corsHeaders });
    }

    let masterData = '';
    if (email.tenant_id) {
      try {
        const { buildMasterDataContext } = await import('@/lib/masterDataContext');
        masterData = await buildMasterDataContext(email.tenant_id, `${email.subject || ''}\n${email.body_text || email.body || email.text || ''}`);
      } catch (e) { console.error('master data context failed', e); }
    }

    const masterDataBlock = masterData
      ? `${masterData}\n\nSTRICT RULE: For lead_gen_quote and auto_reply, only use products, codes, specs or prices that literally appear above. If the client names something not listed, leave those fields blank rather than inventing a code, spec or price.`
      : `MASTER DATA: No product catalog is configured for this workspace.\n\nSTRICT RULE: Do NOT invent product names, codes, specifications or prices in lead_gen_quote or auto_reply. Leave those fields blank / say you will confirm details, rather than guessing.`;

    const signOff = [agent?.name, agent?.title, companyName].filter(Boolean).join('\n') || (companyName || 'The Team');
    const identityBlock = `YOUR IDENTITY (sign the auto_reply as this real person — never a placeholder like [Your Name] or [Your Position]; omit a line if it's blank rather than bracketing it):
${[agent?.name && `Name: ${agent.name}`, agent?.title && `Title: ${agent.title}`, companyName && `Company: ${companyName}`, agent?.phone && `Phone: ${agent.phone}`].filter(Boolean).join('\n')}
Sign-off block to use:\n${signOff}`;

    const systemPrompt = `You are an AI assistant processing an inbound sales email for a CMA, drafting a reply on behalf of a real person — never reveal you are an AI.
Return ONLY valid JSON (no markdown) matching:
{
  "summary": "1-2 sentence summary of what the client wants",
  "auto_reply": "professional reply drafted on behalf of the company, signed with YOUR IDENTITY below, using the master data for any specifics",
  "lead_gen_quote": {
    // keys = Blueprint Section Titles; values = arrays of row objects keyed by field name.
    // Always fill the client's email into the Client Information email field.
    // For product rows: when the client names or codes a product, resolve it against
    // the master data and fill item_code / item_name / uom / item_rate consistently
    // with the parent -> child relationships shown. Never invent codes or prices.
  }
}

${identityBlock}

CMA BLUEPRINT (targets for lead_gen_quote):
${JSON.stringify(blueprint)}

${masterDataBlock}

RULES for auto_reply:
- Sign off using YOUR IDENTITY above, verbatim. Never leave a bracketed placeholder ([Your Name], [Your Position], [Your Company], etc.) in the output.
- Keep it under 2 short paragraphs.

Return ONLY valid JSON. No markdown wrappers.`;

    // one retry: a model occasionally returns an empty or malformed answer
    let result: any = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://bloomgard.vercel.app",
        "X-Title": "Bloomgard AI Inbox"
      },
      body: JSON.stringify({
        model: SMART_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Email Subject: ${email.subject}\nSender: ${email.sender_email}\nBody:\n${email.body_text || email.body_html}` }
        ],
        temperature: 0.1, max_tokens: 2500
      })
    });

      result = await response.json().catch(() => null);
      const content = result?.choices?.[0]?.message?.content;
      try { if (content && parseModelJson(content)) break; } catch { /* retry */ }
    }

    
    if (email.tenant_id && result.usage) {
      const { logAiUsage } = await import('@/utils/usageLogger');
      await logAiUsage(email.tenant_id, null, 'analyze-email', result.usage);
    }

    let analysis;
    try {
      analysis = parseModelJson(result?.choices?.[0]?.message?.content);
    } catch (parseError) {
      console.error("Failed to parse AI JSON response", result?.choices?.[0]?.message?.content);
      return NextResponse.json({ error: "AI returned invalid format." }, { status: 500, headers: corsHeaders });
    }

    return NextResponse.json({ data: analysis }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error("Analyze Email Crash:", error.message);
    return NextResponse.json({ error: "Internal server error analyzing email." }, { status: 500, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}
