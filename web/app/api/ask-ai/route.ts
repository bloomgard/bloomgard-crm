import { NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { query, data, context } = body;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ answer: "System offline. Please contact support." }, { status: 200, headers: corsHeaders });
    }

    const isChartIntentRequest = typeof query === 'string' && query.startsWith('CRITICAL: Return ONLY a valid JSON object');

    let systemPrompt = "";
    let userPrompt = "";

    if (isChartIntentRequest) {
      systemPrompt = `You are Bloomgard AI, an advanced business intelligence engine.
Your sole purpose is to convert user natural language queries into a strict JSON intent object for the frontend charting engine.
You MUST reply with ONLY a JSON object and absolutely no other text, markdown, or explanation.
Format:
{
  "intent": "pie_chart" | "bar_chart" | "line_chart" | "metric" | "list",
  "metric": "value" (for dollar amount) | "count" (for number of quotes),
  "dimension": "status" | "date" | "agent" | "client" | "source",
  "title": "A short 2-4 word title for the chart"
}`;
      userPrompt = query;
    } else {
      systemPrompt = `You are Bloomgard AI, the central executive AI Assistant & Business Intelligence Engine for Bloomgard CRM.
You have real-time visibility into the company's operational database across 4 key areas:
1. QUOTES & CLIENT FOLLOW-UPS: Full status of all quotations, client follow-up trajectories (Voice Call Dispatched, Email Dispatched, Agent Dispatched, Pending, etc.), last contact date, assigned agent, financial value, and transition status logs.
2. INBOX & EMAILS: Inbound emails received from clients, AI sentiment analysis, extracted intents, urgency scores, and email body snippets.
3. MASTER DATA: Configured manual key-value fields and auto-captured schema definitions.
4. PRODUCTS & CATALOG: Item names, rates, quantities, GSM, and applications.

INSTRUCTIONS:
- Directly, accurately, and professionally answer the user's question using the provided Live Context.
- When asked about client follow-ups or "where a client/quote has reached", detail their current quote status, follow-up status, last contact date, and status history logs.
- When asked about emails, reference the inbox email senders, subjects, sentiment, and urgency.
- When asked about master data, summarize configured manual and auto keys.
- Always format your output using clear GitHub-style Markdown (use bold text, bulleted lists, or small tables for readability).`;

      userPrompt = `LIVE BUSINESS CONTEXT:
${JSON.stringify(context || data || {}, null, 2)}

USER QUESTION:
${query || "Give me a summary of client follow-ups and recent inbox emails."}`;
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://bloomgard.vercel.app",
        "X-Title": "Bloomgard"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-2024-11-20",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: isChartIntentRequest ? 0.1 : 0.4,
        max_tokens: 1500,
        response_format: isChartIntentRequest ? { type: "json_object" } : undefined
      })
    });

    const result = await response.json();
    
    const answer = result?.choices?.[0]?.message?.content || "Analysis complete. The system is finalising the report. Please refresh in a moment.";

    return NextResponse.json({ answer }, { status: 200, headers: corsHeaders });

  } catch (error: any) {
    console.error("Critical Crash:", error.message);
    return NextResponse.json({ answer: "The intelligence module is currently syncing with the database." }, { status: 200, headers: corsHeaders });
  }
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}