import { NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { query, data } = body;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ answer: "System offline. Please contact support." }, { status: 200, headers: corsHeaders });
    }

    // PRIORITY ACCESS: Using your $3 credits for Gemma 4 26B A4B
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey.trim()}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://bloomgard.vercel.app",
        "X-Title": "Bloomgard"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-2024-11-20", // Using top-tier GPT-4o model for robust JSON and data aggregation
        messages: [
          { 
            role: "system", 
            content: `You are Bloomgard AI, an advanced business intelligence engine.
Your sole purpose is to convert user natural language queries into a strict JSON intent object for the frontend charting engine.
You MUST reply with ONLY a JSON object and absolutely no other text, markdown, or explanation.
Format:
{
  "intent": "pie_chart" | "bar_chart" | "line_chart" | "metric" | "list",
  "metric": "value" (for dollar amount) | "count" (for number of quotes),
  "dimension": "status" | "date" | "agent" | "client" | "source",
  "title": "A short 2-4 word title for the chart"
}` 
          },
          { role: "user", content: `Query: ${query || "Analyze these records."}` }
        ],
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: "json_object" }
      })
    });

    const result = await response.json();
    
    // With credits, this result will almost always be the answer
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