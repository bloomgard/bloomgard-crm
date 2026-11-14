import { authenticate, AgentCtx } from '@/lib/agent/core';
import { TOOLS, TOOL_LABELS, runTool, isWriteTool } from '@/lib/agent/tools';
import { logAiUsage } from '@/utils/usageLogger';

export const maxDuration = 60;

const MODEL = 'openai/gpt-4o-2024-11-20';
const MAX_STEPS = 8;

const systemPrompt = (ctx: AgentCtx) => `You are Bloomgard AI, the operating brain of the Bloomgard CMA workspace for ${ctx.tenant.company_name || 'this company'}.
You are talking to ${ctx.profile.full_name || ctx.email} (${ctx.role}). Today is ${new Date().toISOString().slice(0, 10)}. Currency is INR (₹).

You can read the whole workspace (quotes, clients, emails, catalogue, settings, follow-ups) and prepare actions through tools.
Rules:
- Ground every fact in tool results. Never invent quotes, prices, emails or numbers. If you do not know, look it up with a tool; if it is not there, say so.
- Prefer the specific tools (search_quotes, get_quote, list_emails, get_master_data, get_followups, make_chart) and fall back to query_database.
- Changes are never applied directly: write tools only PREPARE an action and the user confirms it with a button. After preparing one, say plainly what you prepared and that it is waiting for their confirmation. Do not claim it is done.
- If an earlier prepared action was dismissed, expired or never applied and the user asks for it again, call the write tool again to prepare a fresh action. Never say it is "already prepared".
- For catalogue prices and product details use only Master Data rows. If the client names something not in the catalogue, say so.
- When asked to reply to or follow up with a client, read the quote/email first, then call send_email with a complete, signed message (sign as ${ctx.profile.full_name || 'the sender'}${ctx.profile.job_title ? ', ' + ctx.profile.job_title : ''}). Never send placeholders like [Your Name].
- When asked for a chart or "graph", call make_chart. The chart is shown to the user automatically; add one or two sentences of insight rather than repeating every number.
- Be concise and direct. Use short paragraphs and bullet lists. Use **bold** for key figures. Do not paste raw JSON.
- ${ctx.isManager ? 'This user is a manager/admin and may change catalogue and AI settings.' : 'This user is a sales agent: they only see their own quotes and cannot change the catalogue or workspace AI settings.'}`;

async function callModel(messages: any[]) {
  let last: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    last = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ''}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://cma.bloomgard.co',
        'X-Title': 'Bloomgard CMA',
      },
      body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, tool_choice: 'auto', temperature: 0.2 }),
    });
    if (last.ok || (last.status < 500 && last.status !== 429)) break;
    await new Promise((r) => setTimeout(r, attempt * 1200));
  }
  if (!last || !last.ok) throw new Error(`The AI service returned ${last?.status ?? 'no response'}.`);
  return last.json();
}

export async function POST(request: Request) {
  const ctx = await authenticate(request);
  if (!ctx) return Response.json({ error: 'Not signed in' }, { status: 401 });
  if (!process.env.OPENROUTER_API_KEY) return Response.json({ error: 'AI is not configured' }, { status: 503 });

  let body: any;
  try { body = await request.json(); } catch { return Response.json({ error: 'Bad request' }, { status: 400 }); }
  const history = (Array.isArray(body.messages) ? body.messages : [])
    .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-16)
    .map((m: any) => ({ role: m.role, content: m.content.slice(0, 6000) }));
  if (!history.length || history[history.length - 1].role !== 'user') return Response.json({ error: 'Send a user message' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: any) => controller.enqueue(encoder.encode(JSON.stringify(o) + '\n'));
      const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
      try {
        const messages: any[] = [{ role: 'system', content: systemPrompt(ctx) }, ...history];
        let finished = false;
        for (let step = 0; step < MAX_STEPS && !finished; step++) {
          const res = await callModel(messages);
          const u = res.usage || {};
          usage.prompt_tokens += u.prompt_tokens || 0; usage.completion_tokens += u.completion_tokens || 0; usage.total_tokens += u.total_tokens || 0;
          const msg = res.choices?.[0]?.message;
          if (!msg) throw new Error('Empty response from the AI service.');

          if (msg.tool_calls?.length) {
            messages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });
            await Promise.all(msg.tool_calls.map(async (tc: any) => {
              const name = tc.function?.name;
              let args: any = {};
              try { args = JSON.parse(tc.function?.arguments || '{}'); } catch { /* model sent bad JSON */ }
              const started = Date.now();
              send({ t: 'step', id: tc.id, name, label: TOOL_LABELS[name] || name, write: isWriteTool(name), status: 'running', args });
              let out;
              try { out = await runTool(name, args, ctx); }
              catch (e: any) { out = { result: { error: e.message } }; }
              const failed = !!out.result?.error;
              send({ t: 'step', id: tc.id, name, label: TOOL_LABELS[name] || name, write: isWriteTool(name), status: failed ? 'error' : 'done', ms: Date.now() - started, note: failed ? out.result.error : undefined });
              (out.blocks || []).forEach((b: any) => send({ t: 'block', block: b }));
              if (out.pending) send({ t: 'action', action: out.pending });
              let content = JSON.stringify(out.result);
              if (content.length > 14000) content = content.slice(0, 14000) + '…[truncated]';
              messages.push({ role: 'tool', tool_call_id: tc.id, content });
            }));
            continue;
          }
          send({ t: 'message', content: msg.content || '' });
          finished = true;
        }
        if (!finished) send({ t: 'message', content: 'I hit my step limit before finishing. Try asking for a narrower slice.' });
      } catch (e: any) {
        send({ t: 'error', error: e.message || 'Something went wrong.' });
      } finally {
        send({ t: 'done' });
        controller.close();
        logAiUsage(ctx.tenantId, ctx.userId, 'agent', usage).catch(() => {});
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
