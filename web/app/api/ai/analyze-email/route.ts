import { NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, blueprint, agent, companyName } = body;

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
        masterData = await buildMasterDataContext(email.tenant_id);
      } catch (e) { console.error('master data context failed', e); }
    }

    const masterDataBlock = masterData
      ? `${masterData}\n\nSTRICT RULE: For lead_gen_quote and auto_reply, only use products, codes, specs or prices that literally appear above. If the client names something not listed, leave those fields blank rather than inventing a code, spec or price.`
      : `MASTER DATA: No product catalog is configured for this workspace.\n\nSTRICT RULE: Do NOT invent product names, codes, specifications or prices in lead_gen_quote or auto_reply. Leave those fields blank / say you will confirm details, rather than guessing.`;

    const signOff = [agent?.name, agent?.title, companyName].filter(Boolean).join('\n') || (companyName || 'The Team');
    const identityBlock = `YOUR IDENTITY (sign the auto_reply as this real person — never a placeholder like [Your Name] or [Your Position]; omit a line if it's blank rather than bracketing it):
${[agent?.name && `Name: ${agent.name}`, agent?.title && `Title: ${agent.title}`, companyName && `Company: ${companyName}`, agent?.phone && `Phone: ${agent.phone}`].filter(Boolean).join('\n')}
Sign-off block to use:\n${signOff}`;

    const systemPrompt = `You are an AI assistant processing an inbound sales email for a CRM, drafting a reply on behalf of a real person — never reveal you are an AI.
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

CRM BLUEPRINT (targets for lead_gen_quote):
${JSON.stringify(blueprint)}

${masterDataBlock}

RULES for auto_reply:
- Sign off using YOUR IDENTITY above, verbatim. Never leave a bracketed placeholder ([Your Name], [Your Position], [Your Company], etc.) in the output.
- Keep it under 2 short paragraphs.

Return ONLY valid JSON. No markdown wrappers.`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://bloomgard.vercel.app",
        "X-Title": "Bloomgard AI Inbox"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-2024-11-20",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Email Subject: ${email.subject}\nSender: ${email.sender_email}\nBody:\n${email.body_text || email.body_html}` }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      })
    });

    const result = await response.json();
    
    if (email.tenant_id && result.usage) {
      const { logAiUsage } = await import('@/utils/usageLogger');
      await logAiUsage(email.tenant_id, null, 'analyze-email', result.usage);
    }

    let analysis;
    try {
      analysis = JSON.parse(result?.choices?.[0]?.message?.content);
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
