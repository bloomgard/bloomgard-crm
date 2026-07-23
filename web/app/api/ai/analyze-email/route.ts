import { NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, blueprint } = body;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "System offline. Please contact support." }, { status: 500, headers: corsHeaders });
    }

    if (!email) {
      return NextResponse.json({ error: "Missing email content" }, { status: 400, headers: corsHeaders });
    }

    const systemPrompt = `You are an AI assistant helping to process inbound emails for a CRM platform. 
    Analyze the following email and generate a JSON response strictly matching this schema:
    {
      "summary": "A 1-2 sentence summary of what the client wants",
      "auto_reply": "A professional, polite response drafted on behalf of the company addressing the email",
      "lead_gen_quote": {
        // Extract relevant information mapping to the provided CRM Blueprint fields.
        // Each key should be a Section Title from the blueprint.
        // The value should be an array of objects representing rows, where keys are field names.
        // E.g., "Client Information": [{ "email_id": "sender@email.com", "company_name": "Acme Corp" }]
      }
    }
    
    Here is the CRM Blueprint structure to guide your extraction for lead_gen_quote:
    ${JSON.stringify(blueprint)}
    
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
